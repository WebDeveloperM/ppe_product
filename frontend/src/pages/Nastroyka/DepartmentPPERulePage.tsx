import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import axioss from '../../api/axios';

type Department = {
  id: number;
  name: string;
};

type PPEProduct = {
  id: number;
  name: string;
  type_product: string | null;
  target_gender: 'ALL' | 'M' | 'F';
};

type DepartmentPPERule = {
  id: number;
  department_service_id: number;
  department_name: string;
  ppeproduct: number;
  ppeproduct_name: string;
  ppeproduct_type_product?: string | null;
  ppeproduct_target_gender?: 'ALL' | 'M' | 'F';
  ppeproduct_target_gender_display?: string;
  renewal_months: number;
};

const normalizeRole = (rawRole: string | null): 'admin' | 'warehouse_manager' | 'warehouse_staff' | 'user' => {
  const value = String(rawRole || '').trim().toLowerCase();
  if (value === 'admin' || value === 'админ') return 'admin';
  if (value === 'warehouse_manager' || value === 'складской менеджер') return 'warehouse_manager';
  if (value === 'warehouse_staff' || value === 'складской рабочий') return 'warehouse_staff';
  return 'user';
};

const getBackendError = (error: any, fallback: string) => {
  const data = error?.response?.data;
  if (!data) return fallback;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  const firstField = Object.values(data)[0];
  if (Array.isArray(firstField) && firstField.length) {
    return String(firstField[0]);
  }
  return fallback;
};

const DepartmentPPERulePage = () => {
  const navigate = useNavigate();
  const role = useMemo(() => normalizeRole(localStorage.getItem('role')), []);
  const canEditBaseSettings = role === 'admin' || role === 'warehouse_staff';
  const isAdmin = role === 'admin';

  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [rules, setRules] = useState<DepartmentPPERule[]>([]);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<number[]>([]);
  const [productId, setProductId] = useState('');
  const [renewalMonths, setRenewalMonths] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [departmentsRes, productsRes, rulesRes] = await Promise.all([
        axioss.get('/settings/departments/'),
        axioss.get('/settings/ppe-products/'),
        axioss.get('/settings/ppe-department-rules/'),
      ]);

      setDepartments(departmentsRes.data || []);
      setProducts(productsRes.data || []);
      setRules(rulesRes.data || []);
    } catch (error) {
      toast.error(getBackendError(error, 'Не удалось загрузить данные'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canEditBaseSettings) {
      setLoading(false);
      return;
    }
    loadData();
  }, [canEditBaseSettings]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedDepartmentIds.length === 0 || !productId) {
      toast.warning('Выберите хотя бы один цех и средство защиты');
      return;
    }

    try {
      if (editingRuleId !== null) {
        const payload = {
          department_service_id: Number(selectedDepartmentIds[0]),
          ppeproduct: Number(productId),
          renewal_months: Number(renewalMonths || 0),
        };
        const response = await axioss.put(`/settings/ppe-department-rules/${editingRuleId}/`, payload);
        setRules((prev) => prev.map((item) => (item.id === editingRuleId ? response.data : item)));
        toast.success('Норма обновлена');
      } else {
        const payload = {
          department_service_ids: selectedDepartmentIds,
          ppeproduct: Number(productId),
          renewal_months: Number(renewalMonths || 0),
        };
        const response = await axioss.post('/settings/ppe-department-rules/', payload);
        const createdRules = Array.isArray(response.data) ? response.data : [response.data];
        setRules((prev) => [...prev, ...createdRules]);
        toast.success(createdRules.length > 1 ? 'Нормы добавлены' : 'Норма добавлена');
      }

      setSelectedDepartmentIds([]);
      setProductId('');
      setRenewalMonths('');
      setEditingRuleId(null);
    } catch (error) {
      toast.error(getBackendError(error, editingRuleId !== null ? 'Ошибка при обновлении нормы' : 'Ошибка при добавлении нормы'));
    }
  };

  const handleEdit = (rule: DepartmentPPERule) => {
    setEditingRuleId(rule.id);
    setSelectedDepartmentIds([rule.department_service_id]);
    setProductId(String(rule.ppeproduct));
    setRenewalMonths(String(rule.renewal_months));
  };

  const toggleDepartment = (departmentId: number) => {
    setSelectedDepartmentIds((prev) => {
      if (editingRuleId !== null) {
        return prev.includes(departmentId) ? [] : [departmentId];
      }
      return prev.includes(departmentId)
        ? prev.filter((item) => item !== departmentId)
        : [...prev, departmentId];
    });
  };

  const handleDelete = async (rule: DepartmentPPERule) => {
    const isConfirmed = window.confirm(`Удалить норму для цеха "${rule.department_name}" и СИЗ "${rule.ppeproduct_name}"?`);
    if (!isConfirmed) return;

    try {
      await axioss.delete(`/settings/ppe-department-rules/${rule.id}/`);
      setRules((prev) => prev.filter((item) => item.id !== rule.id));
      if (editingRuleId === rule.id) {
        setEditingRuleId(null);
        setSelectedDepartmentIds([]);
        setProductId('');
        setRenewalMonths('');
      }
      toast.success('Норма удалена');
    } catch (error) {
      toast.error(getBackendError(error, 'Ошибка при удалении нормы'));
    }
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setSelectedDepartmentIds([]);
    setProductId('');
    setRenewalMonths('');
  };

  if (!canEditBaseSettings) {
    return (
      <>
        <Breadcrumb pageName="Нормы выдачи по цехам" />
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="text-base text-red-600">Нет доступа к странице</div>
          <button
            onClick={() => navigate('/nastroyka')}
            className="mt-4 rounded border border-stroke px-4 py-2 hover:bg-gray-100 dark:border-strokedark dark:hover:bg-gray-700"
          >
            ← Назад
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Breadcrumb pageName="Нормы выдачи по цехам" />

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/nastroyka')}
            className="rounded border border-stroke px-4 py-2 hover:bg-gray-100 dark:border-strokedark dark:hover:bg-gray-700"
          >
            ← Назад
          </button>
        </div>

        {loading && (
          <div className="rounded-sm border border-stroke bg-white p-4 text-sm dark:border-strokedark dark:bg-boxdark">
            Загрузка...
          </div>
        )}

        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <form onSubmit={handleSubmit} className="mb-6 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded border border-stroke px-3 py-2 dark:border-strokedark">
                <div className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                  {editingRuleId !== null ? 'Выберите один цех' : 'Выберите один или несколько цехов'}
                </div>
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {departments.map((department) => {
                    const isChecked = selectedDepartmentIds.includes(department.id);
                    return (
                      <label key={department.id} className="flex items-start gap-2 text-sm text-black dark:text-white">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleDepartment(department.id)}
                          className="mt-1"
                        />
                        <span>{department.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 dark:border-strokedark dark:bg-transparent"
              >
                <option value="">Выберите СИЗ</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedDepartmentIds.length > 0 && (
              <div className="rounded border border-dashed border-stroke px-3 py-2 text-sm text-slate-600 dark:border-strokedark dark:text-slate-300">
                Выбрано цехов: {selectedDepartmentIds.length}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                type="number"
                min={0}
                value={renewalMonths}
                onChange={(e) => setRenewalMonths(e.target.value)}
                placeholder="Срок выдачи (мес.)"
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 dark:border-strokedark dark:bg-transparent"
              />
            </div>

            <div className="flex gap-2">
              <button type="submit" className="rounded bg-primary px-4 py-2 text-white">
                {editingRuleId !== null ? 'Сохранить' : 'Добавить'}
              </button>
              {editingRuleId !== null && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded border border-stroke px-4 py-2 dark:border-strokedark"
                >
                  Отмена
                </button>
              )}
            </div>
          </form>

          <div className="max-h-96 overflow-auto">
            {rules.length === 0 ? (
              <p className="text-center text-gray-500">Нет данных</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Цех</th>
                    <th className="px-3 py-2 text-left font-semibold">СИЗ</th>
                    <th className="px-3 py-2 text-left font-semibold">Для кого</th>
                    <th className="px-3 py-2 text-left font-semibold">Тип</th>
                    <th className="px-3 py-2 text-left font-semibold">Срок (мес.)</th>
                    <th className="px-3 py-2 text-left font-semibold">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-t border-stroke dark:border-strokedark">
                      <td className="px-3 py-2">{rule.department_name}</td>
                      <td className="px-3 py-2">{rule.ppeproduct_name}</td>
                      <td className="px-3 py-2">{rule.ppeproduct_target_gender_display || 'Для всех'}</td>
                      <td className="px-3 py-2">{rule.ppeproduct_type_product || '-'}</td>
                      <td className="px-3 py-2">{rule.renewal_months}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(rule)}
                            className="rounded border border-stroke px-2 py-1 text-xs dark:border-strokedark"
                          >
                            Изменить
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(rule)}
                              className="rounded border border-red-400 px-2 py-1 text-xs text-red-600"
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DepartmentPPERulePage;