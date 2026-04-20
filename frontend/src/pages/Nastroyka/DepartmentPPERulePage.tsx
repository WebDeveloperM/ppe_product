import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import axioss from '../../api/axios';

type PositionOption = {
  position_name: string;
  position_key: string;
  employee_count: number;
  department_ids: number[];
  department_names: string[];
};

type DepartmentOption = {
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
  position_name: string;
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
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [rules, setRules] = useState<DepartmentPPERule[]>([]);
  const [selectedPositionNames, setSelectedPositionNames] = useState<string[]>([]);
  const [productId, setProductId] = useState('');
  const [renewalMonths, setRenewalMonths] = useState('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [positionSearch, setPositionSearch] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [isTreeDropdownOpen, setIsTreeDropdownOpen] = useState(false);
  const treeDropdownRef = useRef<HTMLDivElement | null>(null);

  const isAllPositionsSelected = positions.length > 0 && selectedPositionNames.length === positions.length;

  const departmentTree = useMemo(() => (
    departments.map((department) => ({
      ...department,
      positions: positions
        .filter((position) => position.department_ids.includes(department.id))
        .sort((left, right) => left.position_name.localeCompare(right.position_name, 'ru')),
    }))
      .filter((department) => department.positions.length > 0)
  ), [departments, positions]);

  const positionButtonLabel = useMemo(() => {
    if (editingRuleId !== null) {
      return selectedPositionNames[0] || 'Выберите должность';
    }
    if (isAllPositionsSelected) {
      return 'Выбраны все должности';
    }
    if (selectedPositionNames.length === 0) {
      return 'Выберите цех и должность';
    }
    if (selectedPositionNames.length === 1) {
      return selectedPositionNames[0] || 'Выбрана 1 должность';
    }
    return `Выбрано должностей: ${selectedPositionNames.length}`;
  }, [editingRuleId, isAllPositionsSelected, selectedPositionNames]);

  const positionDepartmentsMap = useMemo(() => {
    const map = new Map<string, string[]>();

    positions.forEach((position) => {
      const existingNames = map.get(position.position_name) || [];
      const mergedNames = Array.from(new Set([...existingNames, ...position.department_names]));
      map.set(position.position_name, mergedNames);
    });

    return map;
  }, [positions]);

  const filteredRules = useMemo(() => {
    const normalizedDepartmentSearch = departmentSearch.trim().toLowerCase();
    const normalizedPositionSearch = positionSearch.trim().toLowerCase();

    return rules
      .filter((rule) => {
        const departmentNames = positionDepartmentsMap.get(rule.position_name) || [];
        const matchesDepartment = !normalizedDepartmentSearch
          || departmentNames.some((departmentName) => departmentName.toLowerCase().includes(normalizedDepartmentSearch));
        const matchesPosition = !normalizedPositionSearch
          || rule.position_name.toLowerCase().includes(normalizedPositionSearch);

        return matchesDepartment && matchesPosition;
      })
      .sort((left, right) => {
        const leftDepartments = (positionDepartmentsMap.get(left.position_name) || []).join(', ');
        const rightDepartments = (positionDepartmentsMap.get(right.position_name) || []).join(', ');

        const departmentCompare = leftDepartments.localeCompare(rightDepartments, 'ru');
        if (departmentCompare !== 0) {
          return departmentCompare;
        }

        return left.position_name.localeCompare(right.position_name, 'ru');
      });
  }, [departmentSearch, positionSearch, positionDepartmentsMap, rules]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [departmentsRes, positionsRes, productsRes, rulesRes] = await Promise.all([
        axioss.get('/settings/departments/'),
        axioss.get('/settings/employee-positions/'),
        axioss.get('/settings/ppe-products/'),
        axioss.get('/settings/ppe-department-rules/'),
      ]);

      setDepartments(departmentsRes.data || []);
      setPositions(positionsRes.data || []);
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!treeDropdownRef.current?.contains(event.target as Node)) {
        setIsTreeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedPositionNames.length === 0 || !productId) {
      toast.warning('Выберите хотя бы одну должность и средство защиты');
      return;
    }

    try {
      if (editingRuleId !== null) {
        const payload = {
          position_name: selectedPositionNames[0],
          ppeproduct: Number(productId),
          renewal_months: Number(renewalMonths || 0),
        };
        const response = await axioss.put(`/settings/ppe-department-rules/${editingRuleId}/`, payload);
        setRules((prev) => prev.map((item) => (item.id === editingRuleId ? response.data : item)));
        toast.success('Норма обновлена');
      } else {
        const payload = {
          position_names: selectedPositionNames,
          ppeproduct: Number(productId),
          renewal_months: Number(renewalMonths || 0),
        };
        const response = await axioss.post('/settings/ppe-department-rules/', payload);
        const createdRules = Array.isArray(response.data) ? response.data : [response.data];
        setRules((prev) => [...prev, ...createdRules]);
        toast.success(createdRules.length > 1 ? 'Нормы добавлены' : 'Норма добавлена');
      }

      setSelectedPositionNames([]);
      setProductId('');
      setRenewalMonths('');
      setEditingRuleId(null);
      setIsTreeDropdownOpen(false);
    } catch (error) {
      toast.error(getBackendError(error, editingRuleId !== null ? 'Ошибка при обновлении нормы' : 'Ошибка при добавлении нормы'));
    }
  };

  const handleEdit = (rule: DepartmentPPERule) => {
    setEditingRuleId(rule.id);
    setSelectedPositionNames([rule.position_name]);
    setProductId(String(rule.ppeproduct));
    setRenewalMonths(String(rule.renewal_months));
    setIsTreeDropdownOpen(false);
  };

  const togglePosition = (positionName: string) => {
    setSelectedPositionNames((prev) => {
      if (editingRuleId !== null) {
        return prev.includes(positionName) ? [] : [positionName];
      }
      return prev.includes(positionName)
        ? prev.filter((item) => item !== positionName)
        : [...prev, positionName];
    });
  };

  const getDepartmentPositions = (departmentId: number) => (
    positions.filter((position) => position.department_ids.includes(departmentId))
  );

  const isDepartmentChecked = (departmentId: number) => {
    const departmentPositions = getDepartmentPositions(departmentId);
    return departmentPositions.length > 0
      && departmentPositions.every((position) => selectedPositionNames.includes(position.position_name));
  };

  const isDepartmentIndeterminate = (departmentId: number) => {
    const departmentPositions = getDepartmentPositions(departmentId);
    const selectedCount = departmentPositions.filter((position) => selectedPositionNames.includes(position.position_name)).length;
    return selectedCount > 0 && selectedCount < departmentPositions.length;
  };

  const toggleDepartmentPositions = (departmentId: number) => {
    if (editingRuleId !== null) {
      return;
    }

    const departmentPositionNames = getDepartmentPositions(departmentId).map((position) => position.position_name);
    setSelectedPositionNames((prev) => {
      const current = new Set(prev);
      const shouldClear = departmentPositionNames.every((positionName) => current.has(positionName));

      if (shouldClear) {
        departmentPositionNames.forEach((positionName) => current.delete(positionName));
      } else {
        departmentPositionNames.forEach((positionName) => current.add(positionName));
      }

      return Array.from(current);
    });
  };

  const toggleAllPositions = () => {
    if (editingRuleId !== null) return;
    setSelectedPositionNames(isAllPositionsSelected ? [] : positions.map((position) => position.position_name));
  };

  const handleDelete = async (rule: DepartmentPPERule) => {
    const isConfirmed = window.confirm(`Удалить норму для должности "${rule.position_name}" и СИЗ "${rule.ppeproduct_name}"?`);
    if (!isConfirmed) return;

    try {
      await axioss.delete(`/settings/ppe-department-rules/${rule.id}/`);
      setRules((prev) => prev.filter((item) => item.id !== rule.id));
      if (editingRuleId === rule.id) {
        setEditingRuleId(null);
        setSelectedPositionNames([]);
        setProductId('');
        setRenewalMonths('');
        setIsTreeDropdownOpen(false);
      }
      toast.success('Норма удалена');
    } catch (error) {
      toast.error(getBackendError(error, 'Ошибка при удалении нормы'));
    }
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setSelectedPositionNames([]);
    setProductId('');
    setRenewalMonths('');
    setIsTreeDropdownOpen(false);
  };

  if (!canEditBaseSettings) {
    return (
      <>
        <Breadcrumb pageName="Нормы выдачи по должностям" />
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
      <Breadcrumb pageName="Нормы выдачи по должностям" />

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
              <div className="relative" ref={treeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsTreeDropdownOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded border border-stroke bg-transparent px-3 py-2 text-left dark:border-strokedark dark:bg-transparent"
                >
                  <span className="truncate text-sm text-black dark:text-white">{positionButtonLabel}</span>
                  <span className="ml-3 text-xs text-slate-500">{isTreeDropdownOpen ? '▲' : '▼'}</span>
                </button>

                {isTreeDropdownOpen && (
                  <div className="absolute z-20 mt-2 w-full rounded border border-stroke bg-white p-3 shadow-lg dark:border-strokedark dark:bg-boxdark">
                    <div className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                      {editingRuleId !== null ? 'Выберите должность' : 'Выберите цех и одну или несколько должностей'}
                    </div>

                    {editingRuleId === null && positions.length > 0 && (
                      <label className="mb-3 flex items-start gap-2 border-b border-stroke pb-3 text-sm font-medium text-black dark:border-strokedark dark:text-white">
                        <input
                          type="checkbox"
                          checked={isAllPositionsSelected}
                          onChange={toggleAllPositions}
                          className="mt-1"
                        />
                        <span>Для всех должностей</span>
                      </label>
                    )}

                    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                      {departmentTree.map((department) => (
                        <div key={department.id} className="rounded border border-stroke/70 p-2 dark:border-strokedark/70">
                          <label className="flex items-start gap-2 text-sm font-semibold text-black dark:text-white">
                            <input
                              type="checkbox"
                              checked={isDepartmentChecked(department.id)}
                              ref={(input) => {
                                if (input) {
                                  input.indeterminate = isDepartmentIndeterminate(department.id);
                                }
                              }}
                              onChange={() => toggleDepartmentPositions(department.id)}
                              className="mt-1"
                              disabled={editingRuleId !== null}
                            />
                            <span>{department.name}</span>
                          </label>

                          <div className="mt-2 space-y-2 pl-6">
                            {department.positions.map((position) => {
                              const isChecked = selectedPositionNames.includes(position.position_name);
                              return (
                                <label key={`${department.id}-${position.position_key}`} className="flex items-start gap-2 text-sm text-black dark:text-white">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePosition(position.position_name)}
                                    className="mt-1"
                                  />
                                  <span>{position.position_name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {departmentTree.length === 0 && (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Должности не найдены.
                        </div>
                      )}
                    </div>
                  </div>
                )}
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

            {selectedPositionNames.length > 0 && (
              <div className="rounded border border-dashed border-stroke px-3 py-2 text-sm text-slate-600 dark:border-strokedark dark:text-slate-300">
                Выбрано должностей: {selectedPositionNames.length}
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

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              type="text"
              value={departmentSearch}
              onChange={(e) => setDepartmentSearch(e.target.value)}
              placeholder="Поиск по цеху"
              className="w-full rounded border border-stroke bg-transparent px-3 py-2 dark:border-strokedark dark:bg-transparent"
            />
            <input
              type="text"
              value={positionSearch}
              onChange={(e) => setPositionSearch(e.target.value)}
              placeholder="Поиск по должности"
              className="w-full rounded border border-stroke bg-transparent px-3 py-2 dark:border-strokedark dark:bg-transparent"
            />
          </div>

          <div className="max-h-96 overflow-auto">
            {filteredRules.length === 0 ? (
              <p className="text-center text-gray-500">Нет данных</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Цех</th>
                    <th className="px-3 py-2 text-left font-semibold">Должность</th>
                    <th className="px-3 py-2 text-left font-semibold">СИЗ</th>
                    <th className="px-3 py-2 text-left font-semibold">Для кого</th>
                    <th className="px-3 py-2 text-left font-semibold">Тип</th>
                    <th className="px-3 py-2 text-left font-semibold">Срок (мес.)</th>
                    <th className="px-3 py-2 text-left font-semibold">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule) => (
                    <tr key={rule.id} className="border-t border-stroke dark:border-strokedark">
                      <td className="px-3 py-2">{(positionDepartmentsMap.get(rule.position_name) || []).join(', ') || '-'}</td>
                      <td className="px-3 py-2">{rule.position_name}</td>
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