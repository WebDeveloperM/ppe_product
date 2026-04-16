from datetime import timedelta

from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Department, Section, Employee, PPEProduct, DepartmentPPERenewalRule, PendingItemIssue, Item
from .employee_data import build_employee_snapshot
from .employee_service_client import EmployeeServiceClientError
from users.models import RolePageAccess, UserRole
from unittest.mock import patch
from requests import RequestException


class PendingIssueTwoStepSignatureTests(APITestCase):
	SIGNATURE_DATA_URL = (
		"data:image/png;base64,"
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p0lY3sAAAAASUVORK5CYII="
	)

	def setUp(self):
		self.user = User.objects.create_user(username='regular_user', password='test12345')
		self.created_by = User.objects.create_user(username='issuer_user', password='test12345')

		department = Department.objects.create(name='Test Department', boss_fullName='Boss Name')
		section = Section.objects.create(name='Test Section', department=department)

		self.employee = Employee.objects.create(
			first_name='Ali',
			last_name='Valiyev',
			surname='Testovich',
			tabel_number='T-100500',
			gender='M',
			height='180',
			clothe_size='52',
			shoe_size='42',
			section=section,
			department=department,
			position='Engineer',
		)

		self.product = PPEProduct.objects.create(name='Helmet')

		self.pending = PendingItemIssue.objects.create(
			employee_service_id=self.employee.id,
			employee_slug=self.employee.slug,
			employee_snapshot={
				'id': self.employee.id,
				'external_id': str(self.employee.id),
				'slug': self.employee.slug,
				'first_name': self.employee.first_name,
				'last_name': self.employee.last_name,
				'surname': self.employee.surname,
				'tabel_number': self.employee.tabel_number,
				'gender': self.employee.gender,
				'height': self.employee.height,
				'clothe_size': self.employee.clothe_size,
				'shoe_size': self.employee.shoe_size,
				'position': self.employee.position,
				'requires_face_id_checkout': True,
				'department': {
					'id': self.employee.department_id,
					'name': self.employee.department.name,
					'boss_fullName': self.employee.department.boss_fullName,
				},
				'section': {
					'id': self.employee.section_id,
					'name': self.employee.section.name,
					'department_id': self.employee.department_id,
				},
			},
			ppeproduct_ids=[self.product.id],
			ppe_sizes={str(self.product.id): 'L'},
			expires_at=timezone.now() + timedelta(minutes=3),
			created_by=self.created_by,
		)

		self.confirm_url = f'/api/v1/pending-issue/{self.pending.id}/confirm/'

	def test_non_warehouse_user_cannot_complete_second_step(self):
		self.client.force_authenticate(user=self.user)

		first_response = self.client.post(
			self.confirm_url,
			{'signature': self.SIGNATURE_DATA_URL},
			format='json',
		)
		self.assertEqual(first_response.status_code, 200)
		self.assertEqual(first_response.data.get('step'), 'employee_signed')

		second_response = self.client.post(
			self.confirm_url,
			{'signature': self.SIGNATURE_DATA_URL},
			format='json',
		)
		self.assertEqual(second_response.status_code, 403)

		self.pending.refresh_from_db()
		self.assertEqual(self.pending.status, PendingItemIssue.STATUS_PENDING)
		self.assertIsNotNone(self.pending.signature_image)
		self.assertFalse(bool(self.pending.warehouse_signature_image))


class DueSoonEmployeePPETests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_superuser(username='due_admin', password='test12345')
		self.viewer = User.objects.create_user(username='due_viewer', password='test12345')
		viewer_profile, _ = UserRole.objects.get_or_create(user=self.viewer)
		viewer_profile.role = UserRole.USER
		viewer_profile.save(update_fields=['role'])

		department = Department.objects.create(name='Main Department', boss_fullName='Boss Name')
		section = Section.objects.create(name='Section A', department=department)

		self.employee = Employee.objects.create(
			first_name='Ali',
			last_name='Valiyev',
			surname='Karimovich',
			tabel_number='DUE-001',
			gender='M',
			height='180',
			clothe_size='52',
			shoe_size='42',
			section=section,
			department=department,
			position='Operator',
		)

		self.product = PPEProduct.objects.create(name='Куртка', renewal_months=1)
		issued_at = timezone.now() - timedelta(days=20)
		from .models import Item

		self.item = Item.objects.create(
			employee_service_id=self.employee.id,
			employee_slug=self.employee.slug,
			employee_snapshot={
				'id': self.employee.id,
				'external_id': str(self.employee.id),
				'slug': self.employee.slug,
				'first_name': self.employee.first_name,
				'last_name': self.employee.last_name,
				'surname': self.employee.surname,
				'tabel_number': self.employee.tabel_number,
				'position': self.employee.position,
				'clothe_size': self.employee.clothe_size,
				'shoe_size': self.employee.shoe_size,
				'department': {
					'id': self.employee.department_id,
					'name': self.employee.department.name,
					'boss_fullName': self.employee.department.boss_fullName,
				},
				'section': {
					'id': self.employee.section_id,
					'name': self.employee.section.name,
					'department_id': self.employee.department_id,
				},
			},
			issued_at=issued_at,
			is_deleted=False,
		)
		self.item.ppeproduct.add(self.product)
		self.item.ppe_sizes = {str(self.product.id): 'XL'}
		self.item.save(update_fields=['ppe_sizes'])

	def test_due_soon_endpoint_returns_employee_product_and_size(self):
		self.client.force_authenticate(user=self.admin)

		response = self.client.get('/api/v1/due-soon-employees/?due_days=30')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['total_count'], 1)
		self.assertEqual(response.data['products'][0]['name'], 'Куртка')
		self.assertEqual(response.data['products'][0]['due_count'], 1)
		self.assertEqual(response.data['results'][0]['employee_name'], 'Valiyev Ali Karimovich')
		self.assertEqual(response.data['results'][0]['product_name'], 'Куртка')
		self.assertEqual(response.data['results'][0]['size'], 'XL')

	def test_due_soon_endpoint_respects_due_cards_permission(self):
		RolePageAccess.objects.update_or_create(
			role=UserRole.USER,
			defaults={'can_view_dashboard_due_cards': False},
		)
		self.client.force_authenticate(user=self.viewer)

		response = self.client.get('/api/v1/due-soon-employees/?due_days=30')

		self.assertEqual(response.status_code, 403)


class FaceIdExemptionAccessTests(APITestCase):
	def setUp(self):
		self.manager = User.objects.create_user(username='wm_face', password='test12345')
		profile, _ = UserRole.objects.get_or_create(user=self.manager)
		profile.role = UserRole.WAREHOUSE_MANAGER
		profile.save(update_fields=['role'])
		self.client.force_authenticate(user=self.manager)
		department = Department.objects.create(name='Face Department', boss_fullName='Boss Name')
		section = Section.objects.create(name='Face Section', department=department)
		self.local_employee = Employee.objects.create(
			first_name='Timur',
			last_name='Bakayev',
			surname='Ruslanovich',
			tabel_number='7777',
			gender='M',
			height='180',
			clothe_size='52',
			shoe_size='42',
			section=section,
			department=department,
			position='Engineer',
			requires_face_id_checkout=True,
		)

	@patch('base.views.update_face_id_exemption')
	@patch('base.views.fetch_employee_by_slug_or_404')
	def test_warehouse_manager_can_update_face_id_exemption_by_slug(self, fetch_employee_mock, update_face_id_mock):
		fetch_employee_mock.return_value = {'slug': 'default-7777-timur-bakayev'}
		update_face_id_mock.return_value = {
			'success': True,
			'employee': {
				'slug': 'default-7777-timur-bakayev',
				'full_name': 'Bakayev Timur Ruslanovich',
				'requires_face_id_checkout': False,
			},
		}

		response = self.client.patch(
			'/api/v1/employees/default-7777-timur-bakayev/face-id-exemption/',
			{'requires_face_id_checkout': False},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		fetch_employee_mock.assert_called_once_with('default-7777-timur-bakayev')
		update_face_id_mock.assert_called_once_with('default-7777-timur-bakayev', False)

	@patch('base.views.update_face_id_exemption')
	@patch('base.views.fetch_employee_by_slug_or_404')
	def test_warehouse_manager_falls_back_to_local_face_id_update_when_service_key_is_read_only(self, fetch_employee_mock, update_face_id_mock):
		fetch_employee_mock.return_value = {
			'slug': 'default-7777-timur-bakayev',
			'tabel_number': '7777',
			'first_name': 'Timur',
			'last_name': 'Bakayev',
			'surname': 'Ruslanovich',
		}
		update_face_id_mock.side_effect = EmployeeServiceClientError('Сервисный API-ключ поддерживает только операции чтения.')

		response = self.client.patch(
			'/api/v1/employees/default-7777-timur-bakayev/face-id-exemption/',
			{'requires_face_id_checkout': False},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		self.local_employee.refresh_from_db()
		self.assertFalse(self.local_employee.requires_face_id_checkout)
		self.assertEqual(response.data['employee']['slug'], self.local_employee.slug)
		self.assertFalse(response.data['employee']['requires_face_id_checkout'])


class ItemAddGenderFilteringTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_superuser(username='gender_admin', password='test12345')
		self.client.force_authenticate(user=self.admin)

		department = Department.objects.create(name='Gender Department', boss_fullName='Boss Name')
		section = Section.objects.create(name='Gender Section', department=department)

		self.employee = Employee.objects.create(
			first_name='Ali',
			last_name='Valiyev',
			surname='Karimovich',
			tabel_number='GENDER-001',
			gender='M',
			height='180',
			clothe_size='52',
			shoe_size='42',
			section=section,
			department=department,
			position='Operator',
		)

		self.unisex_product = PPEProduct.objects.create(name='Каска', target_gender='ALL')
		self.male_product = PPEProduct.objects.create(name='Спецодежда мужская', target_gender='M')
		self.female_product = PPEProduct.objects.create(name='Спецодежда женская', target_gender='F')

		self.item = Item.objects.create(
			employee_service_id=self.employee.id,
			employee_slug=self.employee.slug,
			slug=self.employee.slug,
			employee_snapshot={
				'id': self.employee.id,
				'external_id': str(self.employee.id),
				'slug': self.employee.slug,
				'first_name': self.employee.first_name,
				'last_name': self.employee.last_name,
				'surname': self.employee.surname,
				'tabel_number': self.employee.tabel_number,
				'gender': self.employee.gender,
				'height': self.employee.height,
				'clothe_size': self.employee.clothe_size,
				'shoe_size': self.employee.shoe_size,
				'position': self.employee.position,
				'department': {
					'id': self.employee.department_id,
					'name': self.employee.department.name,
					'boss_fullName': self.employee.department.boss_fullName,
				},
				'section': {
					'id': self.employee.section_id,
					'name': self.employee.section.name,
					'department_id': self.employee.department_id,
				},
			},
			is_deleted=False,
		)

	def test_add_item_get_filters_products_by_employee_gender(self):
		response = self.client.get(f'/api/v1/add-item/{self.employee.slug}')

		self.assertEqual(response.status_code, 200)
		product_names = {product['name'] for product in response.data['ppe_products']}
		self.assertIn('Каска', product_names)
		self.assertIn('Спецодежда мужская', product_names)
		self.assertNotIn('Спецодежда женская', product_names)

	def test_add_item_post_rejects_product_with_wrong_gender(self):
		response = self.client.post(
			f'/api/v1/add-item/{self.employee.slug}',
			{'ppeproduct': [self.female_product.id], 'ppe_sizes': {}},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(response.data['error_code'], 'ppe_gender_mismatch')
		self.assertIn('Спецодежда женская', response.data['error'])


class DepartmentPPERenewalRuleTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_superuser(username='rule_admin', password='test12345')
		self.client.force_authenticate(user=self.admin)

		department = Department.objects.create(name='1-Цех', boss_fullName='Boss Name')
		section = Section.objects.create(name='Section A', department=department)

		self.employee = Employee.objects.create(
			first_name='Ali',
			last_name='Valiyev',
			surname='Karimovich',
			tabel_number='RULE-001',
			gender='M',
			height='180',
			clothe_size='52',
			shoe_size='42',
			section=section,
			department=department,
			position='Operator',
		)

		self.product = PPEProduct.objects.create(name='Спецодежда (мужское)', renewal_months=6, target_gender='M')
		DepartmentPPERenewalRule.objects.create(
			department_service_id=1,
			department_name='1-Цех',
			ppeproduct=self.product,
			renewal_months=12,
		)

		self.item = Item.objects.create(
			employee_service_id=self.employee.id,
			employee_slug=self.employee.slug,
			slug=self.employee.slug,
			employee_snapshot={
				'id': self.employee.id,
				'external_id': str(self.employee.id),
				'slug': self.employee.slug,
				'first_name': self.employee.first_name,
				'last_name': self.employee.last_name,
				'surname': self.employee.surname,
				'tabel_number': self.employee.tabel_number,
				'gender': self.employee.gender,
				'height': self.employee.height,
				'clothe_size': self.employee.clothe_size,
				'shoe_size': self.employee.shoe_size,
				'position': self.employee.position,
				'department': {
					'id': 1,
					'name': '1-Цех',
					'boss_fullName': self.employee.department.boss_fullName,
				},
				'section': {
					'id': self.employee.section_id,
					'name': self.employee.section.name,
					'department_id': 1,
				},
			},
			issued_at=timezone.now() - timedelta(days=240),
			is_deleted=False,
		)
		self.item.ppeproduct.add(self.product)

	def test_add_item_get_returns_department_override_months(self):
		response = self.client.get(f'/api/v1/add-item/{self.employee.slug}')

		self.assertEqual(response.status_code, 200)
		product_payload = next(item for item in response.data['ppe_products'] if item['id'] == self.product.id)
		self.assertEqual(product_payload['renewal_months'], 12)

	def test_add_item_post_blocks_until_department_override_period_expires(self):
		response = self.client.post(
			f'/api/v1/add-item/{self.employee.slug}',
			{'ppeproduct': [self.product.id], 'ppe_sizes': {str(self.product.id): '52'}},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(response.data['error_code'], 'ppe_not_due')
		self.assertIn('Спецодежда (мужское)', response.data['error'])


class EmployeeServiceFaceFallbackTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_superuser(username='face_fallback_admin', password='test12345')
		self.client.force_authenticate(user=self.admin)

	@patch('base.views.calculate_face_similarity', return_value=88.5)
	@patch('base.views.decode_image_to_pil', return_value=object())
	@patch('base.views.load_employee_reference_image', return_value=(object(), ''))
	@patch('base.views.resolve_employee_from_slug', return_value={'slug': 'default-9112-maruf-shabonov'})
	@patch('base.views.verify_employee_face_remote', side_effect=Exception)
	def test_verify_employee_face_falls_back_when_service_key_is_read_only(self, verify_remote_mock, resolve_mock, load_mock, decode_mock, similarity_mock):
		verify_remote_mock.side_effect = EmployeeServiceClientError('Сервисный API-ключ поддерживает только операции чтения.')

		with patch('base.views.is_employee_service_enabled', return_value=True):
			response = self.client.post(
				'/api/v1/verify-employee-face/default-9112-maruf-shabonov',
				{'captured_image': 'data:image/jpeg;base64,ZmFrZQ=='},
				format='json',
			)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.data['verified'])
		self.assertEqual(response.data['message'], 'Сотрудник подтвержден')
		resolve_mock.assert_called_once_with('default-9112-maruf-shabonov')
		load_mock.assert_called_once()
		decode_mock.assert_called_once()
		similarity_mock.assert_called_once()

	@patch('base.views.detect_face_boxes', return_value=[{'x': 10, 'y': 20, 'width': 30, 'height': 40}])
	@patch('base.views.decode_image_to_pil', return_value=object())
	@patch('base.views.detect_face_boxes_remote', side_effect=Exception)
	def test_detect_face_boxes_falls_back_when_service_key_is_read_only(self, detect_remote_mock, decode_mock, detect_local_mock):
		detect_remote_mock.side_effect = EmployeeServiceClientError('Сервисный API-ключ поддерживает только операции чтения.')

		with patch('base.views.is_employee_service_enabled', return_value=True):
			response = self.client.post(
				'/api/v1/detect-face-boxes/',
				{'captured_image': 'data:image/jpeg;base64,ZmFrZQ=='},
				format='json',
			)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['count'], 1)
		self.assertEqual(response.data['boxes'][0]['x'], 10)
		decode_mock.assert_called_once()
		detect_local_mock.assert_called_once()


class ItemDetailEmployeeSnapshotRefreshTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_superuser(username='item_detail_admin', password='test12345')
		self.client.force_authenticate(user=self.admin)
		self.product = PPEProduct.objects.create(name='Helmet')
		self.item = Item.objects.create(
			employee_service_id=3,
			employee_slug='default-7777-timur-bakayev',
			employee_snapshot={
				'id': 3,
				'external_id': '',
				'slug': 'default-7777-timur-bakayev',
				'first_name': 'Timur',
				'last_name': 'Bakayev',
				'surname': 'Ruslanovich',
				'tabel_number': '7777',
				'base_image': '/api/v1/employee-service/media-proxy/?path=%2Fmedia%2Femployee_base_images%2Fold-photo.jpg',
				'base_image_url': '/api/v1/employee-service/media-proxy/?path=%2Fmedia%2Femployee_base_images%2Fold-photo.jpg',
				'department': {'id': 1, 'name': '28-цех Связь', 'boss_fullName': 'Old Boss'},
				'section': {'id': 1, 'name': 'AKT', 'department_id': 1},
			},
		)
		self.item.ppeproduct.add(self.product)

	@patch('base.views.get_employees_by_slugs')
	@patch('base.views.get_employees_by_external_ids', return_value={})
	@patch('base.views.list_sections', return_value=[])
	@patch('base.views.list_departments', return_value=[])
	def test_item_detail_uses_live_employee_image_from_slug_lookup(self, list_departments_mock, list_sections_mock, by_ids_mock, by_slugs_mock):
		by_slugs_mock.return_value = {
			'default-7777-timur-bakayev': {
				'id': 3,
				'external_id': '',
				'source_system': 'default',
				'slug': 'default-7777-timur-bakayev',
				'first_name': 'Timur',
				'last_name': 'Bakayev',
				'surname': 'Ruslanovich',
				'tabel_number': '7777',
				'base_image': '/api/v1/employee-service/media-proxy/?path=%2Fmedia%2Femployee_base_images%2Fbakayev-live.jpg',
				'base_image_url': '/api/v1/employee-service/media-proxy/?path=%2Fmedia%2Femployee_base_images%2Fbakayev-live.jpg',
				'department': {'id': 2, 'name': '1-Цех. Технология', 'boss_fullName': 'Norov Navoiy'},
				'section': {'id': 3, 'name': 'Блок 2', 'department_id': 2},
			},
		}

		response = self.client.get(f'/api/v1/item-view/{self.item.slug}')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['employee']['base_image'], '/api/v1/employee-service/media-proxy/?path=%2Fmedia%2Femployee_base_images%2Fbakayev-live.jpg')
		self.assertEqual(response.data['employee']['department']['name'], '1-Цех. Технология')
		by_ids_mock.assert_called_once()
		by_slugs_mock.assert_called_once()


class EmployeeServiceMediaProxyTests(APITestCase):
	def test_build_employee_snapshot_rewrites_host_docker_internal_media_to_proxy_path(self):
		payload = build_employee_snapshot({
			'base_image': 'https://host.docker.internal:5000/media/employee_base_images/5413-a.jpg',
			'base_image_url': 'https://host.docker.internal:5000/media/employee_base_images/5413-a.jpg',
		})

		self.assertEqual(
			payload['base_image'],
			'/api/v1/employee-service/media-proxy/?path=%2Fmedia%2Femployee_base_images%2F5413-a.jpg',
		)
		self.assertEqual(
			payload['base_image_url'],
			'/api/v1/employee-service/media-proxy/?path=%2Fmedia%2Femployee_base_images%2F5413-a.jpg',
		)

	def test_build_employee_snapshot_preserves_employee_service_size_fields(self):
		payload = build_employee_snapshot({
			'special_clothing_size': '54',
			'clothe_size': '56',
			'shoe_size': '42',
			'jacket_size': '58',
			'tshirt_size': 'L',
		})

		self.assertEqual(payload['special_clothing_size'], '54')
		self.assertEqual(payload['clothe_size'], '56')
		self.assertEqual(payload['shoe_size'], '42')
		self.assertEqual(payload['jacket_size'], '58')
		self.assertEqual(payload['tshirt_size'], 'L')

	@patch('base.employee_service_views.requests.get')
	@patch('base.employee_service_views.settings')
	def test_media_proxy_falls_back_to_public_origin_when_internal_media_is_unavailable(self, settings_mock, requests_get_mock):
		settings_mock.EMPLOYEE_SERVICE_BASE_URL = 'http://employee-service:8010'
		settings_mock.EMPLOYEE_SERVICE_PUBLIC_URL = 'https://192.168.101.6:5001'
		settings_mock.EMPLOYEE_SERVICE_TIMEOUT = 15

		public_response = type('Response', (), {
			'status_code': 200,
			'content': b'image-bytes',
			'headers': {'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=60'},
		})()
		requests_get_mock.side_effect = [
			RequestException('internal media unavailable'),
			public_response,
		]

		response = self.client.get('/api/v1/employee-service/media-proxy/?path=%2Fmedia%2Femployee_base_images%2Fphoto.jpg')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.content, b'image-bytes')
		self.assertEqual(response['Content-Type'], 'image/jpeg')
		self.assertEqual(response['Cache-Control'], 'max-age=60')
		self.assertEqual(requests_get_mock.call_count, 2)
		self.assertEqual(requests_get_mock.call_args_list[0].args[0], 'http://employee-service:8010/media/employee_base_images/photo.jpg')
		self.assertEqual(requests_get_mock.call_args_list[1].args[0], 'https://192.168.101.6:5001/media/employee_base_images/photo.jpg')
