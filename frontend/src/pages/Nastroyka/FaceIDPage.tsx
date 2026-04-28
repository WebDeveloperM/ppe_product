import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import axioss from '../../api/axios';
import { getStoredFeatureAccess, normalizeRole } from '../../utils/pageAccess';

type Employee = {
  id: number;
  slug: string;
  first_name: string;
  last_name: string;
  surname: string;
  tabel_number: string;
  position: string;
  requires_face_id_checkout: boolean;
};

const PAGE_SIZE = 50;

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

const getEmployeeFullName = (employee: Employee) => {
  return `${employee.last_name} ${employee.first_name} ${employee.surname || ''}`.trim() || '—';
};

const FaceIDPage = () => {
  const navigate = useNavigate();
  const role = useMemo(() => normalizeRole(localStorage.getItem('role')), []);
  const canManageFaceIdControl = useMemo(() => getStoredFeatureAccess(role).face_id_control, [role]);

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tableNumberSearch, setTableNumberSearch] = useState('');
  const [employeeNameSearch, setEmployeeNameSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingEmployee, setPendingEmployee] = useState<Employee | null>(null);
  const [pendingNewStatus, setPendingNewStatus] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalEmployees, setModalEmployees] = useState<Employee[]>([]);
  const [modalTableNumberSearch, setModalTableNumberSearch] = useState('');
  const [modalEmployeeNameSearch, setModalEmployeeNameSearch] = useState('');
  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const [modalTotalCount, setModalTotalCount] = useState(0);
  const [selectedModalEmployee, setSelectedModalEmployee] = useState<Employee | null>(null);
  const [savingSelectedEmployee, setSavingSelectedEmployee] = useState(false);

  const loadEmployees = async (page = 1) => {
    setLoading(true);
    try {
      const search = [tableNumberSearch.trim(), employeeNameSearch.trim()].filter(Boolean).join(' ');
      const response = await axioss.get('/employees/face-id-exemption/', {
        params: {
          page,
          page_size: PAGE_SIZE,
          search: search || undefined,
        },
      });
      setEmployees(response.data?.employees || []);
      setTotalCount(Number(response.data?.count || 0));
      setCurrentPage(page);
    } catch (error) {
      toast.error(getBackendError(error, 'Не удалось загрузить список сотрудников'));
    } finally {
      setLoading(false);
    }
  };

  const loadModalEmployees = async (page = 1) => {
    setModalLoading(true);
    try {
      const search = [modalTableNumberSearch.trim(), modalEmployeeNameSearch.trim()].filter(Boolean).join(' ');
      const response = await axioss.get('/employees/face-id-exemption/', {
        params: {
          page,
          page_size: PAGE_SIZE,
          search: search || undefined,
        },
      });
      setModalEmployees(response.data?.employees || []);
      setModalTotalCount(Number(response.data?.count || 0));
      setModalCurrentPage(page);
    } catch (error) {
      toast.error(getBackendError(error, 'Не удалось загрузить сотрудников для добавления'));
    } finally {
      setModalLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageFaceIdControl) {
      setLoading(false);
      return;
    }
    loadEmployees(1);
  }, [canManageFaceIdControl]);

  useEffect(() => {
    if (!canManageFaceIdControl) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      loadEmployees(1);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [canManageFaceIdControl, employeeNameSearch, tableNumberSearch]);

  useEffect(() => {
    if (!canManageFaceIdControl || !isAddModalOpen) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      loadModalEmployees(1);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [canManageFaceIdControl, isAddModalOpen, modalEmployeeNameSearch, modalTableNumberSearch]);

  const handleToggleFaceIdExemption = async (employeeSlug: string, employeeId: number, newStatus: boolean) => {
    try {
      const response = await axioss.patch(`/employees/${employeeSlug}/face-id-exemption/`, {
        requires_face_id_checkout: newStatus,
      });
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === employeeId ? { ...emp, requires_face_id_checkout: newStatus } : emp,
        ),
      );
      const message = newStatus
        ? `Face ID требуется для ${response.data.employee.full_name}`
        : `Face ID НЕ требуется для ${response.data.employee.full_name}`;
      toast.success(message);
      if (isAddModalOpen) {
        loadModalEmployees(modalCurrentPage);
      }
    } catch (error) {
      toast.error(getBackendError(error, 'Ошибка при обновлении статуса Face ID'));
    }
  };

  const openAddModal = () => {
    setModalTableNumberSearch('');
    setModalEmployeeNameSearch('');
    setSelectedModalEmployee(null);
    setModalCurrentPage(1);
    setModalTotalCount(0);
    setModalEmployees([]);
    setIsAddModalOpen(true);
    loadModalEmployees(1);
  };

  const closeAddModal = () => {
    if (savingSelectedEmployee) {
      return;
    }
    setIsAddModalOpen(false);
    setSelectedModalEmployee(null);
  };

  const handleAddSelectedEmployee = async () => {
    if (!selectedModalEmployee || savingSelectedEmployee) {
      return;
    }
    if (!selectedModalEmployee.requires_face_id_checkout) {
      toast.info(`Для ${getEmployeeFullName(selectedModalEmployee)} Face ID уже не требуется`);
      closeAddModal();
      return;
    }

    setSavingSelectedEmployee(true);
    try {
      await handleToggleFaceIdExemption(selectedModalEmployee.slug, selectedModalEmployee.id, false);
      await loadEmployees(1);
      setIsAddModalOpen(false);
      setSelectedModalEmployee(null);
    } finally {
      setSavingSelectedEmployee(false);
    }
  };

  const openConfirmModal = (employee: Employee, newStatus: boolean) => {
    setPendingEmployee(employee);
    setPendingNewStatus(newStatus);
    setShowConfirmModal(true);
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setPendingEmployee(null);
    setPendingNewStatus(false);
  };

  const confirmToggle = () => {
    if (pendingEmployee) {
      handleToggleFaceIdExemption(pendingEmployee.slug, pendingEmployee.id, pendingNewStatus);
    }
    closeConfirmModal();
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (!canManageFaceIdControl) {
    return (
      <>
        <Breadcrumb pageName="Face ID настройки" />
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="text-base text-red-600">Нет доступа к странице</div>
          <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            У вашей роли нет доступа к управлению Face ID.
          </div>
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
      <Breadcrumb pageName="Face ID настройки" />

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/nastroyka')}
            className="rounded border border-stroke px-4 py-2 hover:bg-gray-100 dark:border-strokedark dark:hover:bg-gray-700"
          >
            ← Назад
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="rounded bg-primary px-4 py-2 text-white hover:bg-opacity-90"
          >
            + Добавить
          </button>
        </div>

        {loading && (
          <div className="rounded-sm border border-stroke bg-white p-4 text-sm dark:border-strokedark dark:bg-boxdark">
            Загрузка...
          </div>
        )}

        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Выберите сотрудников, которым не требуется Face ID верификация при получении СИЗ.
          </p>

          <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              type="text"
              value={tableNumberSearch}
              onChange={(event) => setTableNumberSearch(event.target.value)}
              placeholder="Поиск по табельному номеру"
              className="w-full rounded border border-stroke bg-white px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
            />
            <input
              type="text"
              value={employeeNameSearch}
              onChange={(event) => setEmployeeNameSearch(event.target.value)}
              placeholder="Поиск по ФИО"
              className="w-full rounded border border-stroke bg-white px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Таб. №</th>
                  <th className="px-3 py-2 text-left font-semibold">ФИО</th>
                  <th className="px-3 py-2 text-left font-semibold">Должность</th>
                  <th className="px-3 py-2 text-left font-semibold">Face ID при выдаче</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const fullName = getEmployeeFullName(emp);
                  return (
                    <tr key={emp.id} className="border-t border-stroke dark:border-strokedark">
                      <td className="px-3 py-2 text-gray-500">{emp.tabel_number || '—'}</td>
                      <td className="px-3 py-2">{fullName || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{emp.position || '—'}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openConfirmModal(emp, !emp.requires_face_id_checkout)}
                          className={`rounded px-3 py-1 text-xs font-medium ${emp.requires_face_id_checkout ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}
                        >
                          {emp.requires_face_id_checkout ? 'Требуется' : 'Не требуется'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && employees.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-500">Нет данных</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-stroke pt-4 text-sm dark:border-strokedark sm:flex-row sm:items-center sm:justify-between">
            <div className="text-gray-500">
              Показано {(totalCount === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1)}-
              {Math.min(currentPage * PAGE_SIZE, totalCount)} из {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadEmployees(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="rounded border border-stroke px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-strokedark"
              >
                Назад
              </button>
              <span className="text-gray-500">{currentPage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => loadEmployees(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="rounded border border-stroke px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-strokedark"
              >
                Вперёд
              </button>
            </div>
          </div>
        </div>
      </div>

      {showConfirmModal && pendingEmployee && (
        <div className="fixed inset-0 z-99999 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <h3 className="text-xl font-semibold text-black dark:text-white">Подтвердите изменение</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Изменить требование Face ID для сотрудника{' '}
              <span className="font-medium text-black dark:text-white">
                {`${pendingEmployee.last_name} ${pendingEmployee.first_name} ${pendingEmployee.surname || ''}`.trim()}
              </span>
              ?
            </p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={confirmToggle} className="rounded bg-primary px-4 py-2 text-white">
                Подтвердить
              </button>
              <button type="button" onClick={closeConfirmModal} className="rounded border border-stroke px-4 py-2 dark:border-strokedark">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="flex h-[70vh] w-[80vw] max-w-[80vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-boxdark">
            <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Добавить сотрудника</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  Выберите сотрудника, для которого Face ID при выдаче СИЗ не требуется.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={savingSelectedEmployee}
                className="rounded px-3 py-1 text-sm text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-boxdark-2"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={modalTableNumberSearch}
                  onChange={(event) => setModalTableNumberSearch(event.target.value)}
                  placeholder="Поиск по табельному номеру"
                  className="w-full rounded border border-stroke bg-white px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
                />
                <input
                  type="text"
                  value={modalEmployeeNameSearch}
                  onChange={(event) => setModalEmployeeNameSearch(event.target.value)}
                  placeholder="Поиск по ФИО"
                  className="w-full rounded border border-stroke bg-white px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
                />
              </div>

              <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Таб. №</th>
                      <th className="px-3 py-2 text-left font-semibold">ФИО</th>
                      <th className="px-3 py-2 text-left font-semibold">Должность</th>
                      <th className="px-3 py-2 text-left font-semibold">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalEmployees.map((emp) => {
                      const isSelected = selectedModalEmployee?.id === emp.id;
                      return (
                        <tr
                          key={emp.id}
                          onClick={() => setSelectedModalEmployee(emp)}
                          className={`cursor-pointer border-t border-stroke transition-colors dark:border-strokedark ${
                            isSelected ? 'bg-primary/10' : 'hover:bg-slate-50 dark:hover:bg-boxdark-2'
                          }`}
                        >
                          <td className="px-3 py-3 text-gray-500">{emp.tabel_number || '—'}</td>
                          <td className="px-3 py-3 text-slate-900 dark:text-white">{getEmployeeFullName(emp)}</td>
                          <td className="px-3 py-3 text-gray-500">{emp.position || '—'}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded px-3 py-1 text-xs font-medium ${
                                emp.requires_face_id_checkout
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {emp.requires_face_id_checkout ? 'Требуется' : 'Не требуется'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!modalLoading && modalEmployees.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-500">Нет сотрудников</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="text-gray-500">
                  Показано {(modalTotalCount === 0 ? 0 : ((modalCurrentPage - 1) * PAGE_SIZE) + 1)}-
                  {Math.min(modalCurrentPage * PAGE_SIZE, modalTotalCount)} из {modalTotalCount}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadModalEmployees(Math.max(1, modalCurrentPage - 1))}
                    disabled={modalCurrentPage <= 1 || modalLoading}
                    className="rounded border border-stroke px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-strokedark"
                  >
                    Назад
                  </button>
                  <span className="text-gray-500">
                    {modalCurrentPage} / {Math.max(1, Math.ceil(modalTotalCount / PAGE_SIZE))}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadModalEmployees(Math.min(Math.max(1, Math.ceil(modalTotalCount / PAGE_SIZE)), modalCurrentPage + 1))}
                    disabled={modalCurrentPage >= Math.max(1, Math.ceil(modalTotalCount / PAGE_SIZE)) || modalLoading}
                    className="rounded border border-stroke px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-strokedark"
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-stroke px-6 py-4 dark:border-strokedark">
              <button
                type="button"
                onClick={closeAddModal}
                disabled={savingSelectedEmployee}
                className="rounded border border-stroke px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-strokedark dark:text-slate-200 dark:hover:bg-boxdark-2"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAddSelectedEmployee}
                disabled={!selectedModalEmployee || savingSelectedEmployee}
                className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingSelectedEmployee ? 'Сохранение...' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FaceIDPage;
