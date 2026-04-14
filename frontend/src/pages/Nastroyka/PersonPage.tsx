import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import axioss from '../../api/axios';

type ResponsiblePerson = {
  id: number;
  full_name: string;
  position: string;
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

const PersonPage = () => {
  const navigate = useNavigate();
  const role = useMemo(() => normalizeRole(localStorage.getItem('role')), []);
  const canEditBaseSettings = role === 'admin' || role === 'warehouse_staff';
  const isAdmin = role === 'admin';

  const [loading, setLoading] = useState(true);
  const [persons, setPersons] = useState<ResponsiblePerson[]>([]);
  const [personFullName, setPersonFullName] = useState('');
  const [personPosition, setPersonPosition] = useState('');
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);

  const loadPersons = async () => {
    setLoading(true);
    try {
      const response = await axioss.get('/settings/responsible-persons/');
      setPersons(response.data || []);
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
    loadPersons();
  }, [canEditBaseSettings]);

  const handleCreatePerson = async (event: FormEvent) => {
    event.preventDefault();
    if (!personFullName.trim() || !personPosition.trim()) {
      toast.warning('ФИО и должность ответственного лица обязательны');
      return;
    }

    try {
      if (editingPersonId !== null) {
        const response = await axioss.put(`/settings/responsible-persons/${editingPersonId}/`, {
          full_name: personFullName.trim(),
          position: personPosition.trim(),
        });
        setPersons((prev) => prev.map((entry) => (entry.id === editingPersonId ? response.data : entry)));
        toast.success('Ответственное лицо обновлено');
        setEditingPersonId(null);
      } else {
        const response = await axioss.post('/settings/responsible-persons/', {
          full_name: personFullName.trim(),
          position: personPosition.trim(),
        });
        setPersons((prev) => [...prev, response.data]);
        toast.success('Ответственное лицо добавлено');
      }
      setPersonFullName('');
      setPersonPosition('');
    } catch (error) {
      toast.error(getBackendError(error, editingPersonId !== null ? 'Ошибка при обновлении ответственного лица' : 'Ошибка при добавлении ответственного лица'));
    }
  };

  const handleEditPerson = (item: ResponsiblePerson) => {
    setEditingPersonId(item.id);
    setPersonFullName(item.full_name || '');
    setPersonPosition(item.position || '');
  };

  const handleDeletePerson = async (item: ResponsiblePerson) => {
    const isConfirmed = window.confirm(`Удалить запись "${item.full_name}"?`);
    if (!isConfirmed) return;

    try {
      await axioss.delete(`/settings/responsible-persons/${item.id}/`);
      setPersons((prev) => prev.filter((entry) => entry.id !== item.id));
      if (editingPersonId === item.id) {
        setEditingPersonId(null);
        setPersonFullName('');
        setPersonPosition('');
      }
      toast.success('Ответственное лицо удалено');
    } catch (error) {
      toast.error(getBackendError(error, 'Ошибка при удалении ответственного лица'));
    }
  };

  const handleCancelEdit = () => {
    setEditingPersonId(null);
    setPersonFullName('');
    setPersonPosition('');
  };

  if (!canEditBaseSettings) {
    return (
      <>
        <Breadcrumb pageName="Ответственное лицо" />
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
      <Breadcrumb pageName="Ответственное лицо" />

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
          <form onSubmit={handleCreatePerson} className="mb-6 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={personFullName}
                onChange={(e) => setPersonFullName(e.target.value)}
                placeholder="ФИО"
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 dark:border-strokedark dark:bg-transparent"
              />
              <input
                value={personPosition}
                onChange={(e) => setPersonPosition(e.target.value)}
                placeholder="Должность"
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 dark:border-strokedark dark:bg-transparent"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="rounded bg-primary px-4 py-2 text-white">
                {editingPersonId !== null ? 'Сохранить' : 'Добавить'}
              </button>
              {editingPersonId !== null && (
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
            {persons.length === 0 ? (
              <p className="text-center text-gray-500">Нет данных</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Должность</th>
                    <th className="px-3 py-2 text-left font-semibold">ФИО</th>
                    {isAdmin && <th className="px-3 py-2 text-left font-semibold">Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {persons.map((item) => (
                    <tr key={item.id} className="border-t border-stroke dark:border-strokedark">
                      <td className="px-3 py-2">{item.position}</td>
                      <td className="px-3 py-2">{item.full_name}</td>
                      {isAdmin && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditPerson(item)}
                              className="rounded border border-stroke px-2 py-1 text-xs dark:border-strokedark"
                            >
                              Изменить
                            </button>
                            <button
                              onClick={() => handleDeletePerson(item)}
                              className="rounded border border-red-400 px-2 py-1 text-xs text-red-600"
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      )}
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

export default PersonPage;
