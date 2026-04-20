import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from 'flowbite-react';
import { FiAlertTriangle, FiTrash2 } from 'react-icons/fi';
import axioss from '../../api/axios';

type PositionOption = {
  selection_key: string;
  position_name: string;
  position_key: string;
  employee_count: number;
  department_id: number | null;
  department_name: string;
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
  is_active?: boolean;
};

type DepartmentPPERule = {
  id: number;
  department_service_id?: number | null;
  department_name?: string;
  position_name: string;
  ppeproduct: number;
  ppeproduct_name: string;
  ppeproduct_type_product?: string | null;
  ppeproduct_target_gender?: 'ALL' | 'M' | 'F';
  ppeproduct_target_gender_display?: string;
  renewal_months: number;
};

type DepartmentPPERuleGroup = {
  key: string;
  department_service_id: number | null;
  department_name: string;
  position_name: string;
  items: DepartmentPPERule[];
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
  const [selectedPositionKeys, setSelectedPositionKeys] = useState<string[]>([]);
  const [productId, setProductId] = useState('');
  const [renewalMonths, setRenewalMonths] = useState('');
  const [productMonths, setProductMonths] = useState<Record<number, string>>({});
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [positionSearch, setPositionSearch] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<DepartmentPPERule | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isTreeDropdownOpen, setIsTreeDropdownOpen] = useState(false);
  const treeDropdownRef = useRef<HTMLDivElement | null>(null);

  const isAllPositionsSelected = positions.length > 0 && selectedPositionKeys.length === positions.length;

  const selectedPositionEntries = useMemo(
    () => positions.filter((position) => selectedPositionKeys.includes(position.selection_key)),
    [positions, selectedPositionKeys],
  );

  const departmentOrderMap = useMemo(() => {
    const nextMap = new Map<number, number>();
    departments.forEach((department, index) => nextMap.set(department.id, index));
    return nextMap;
  }, [departments]);

  const departmentNameMap = useMemo(() => {
    const nextMap = new Map<number, string>();
    departments.forEach((department) => nextMap.set(department.id, department.name));
    return nextMap;
  }, [departments]);

  const getRuleDepartmentName = (rule: DepartmentPPERule) => {
    if (rule.department_service_id !== null && rule.department_service_id !== undefined) {
      const mappedName = departmentNameMap.get(rule.department_service_id);
      if (mappedName) {
        return mappedName;
      }
    }
    return String(rule.department_name || '').trim();
  };

  const departmentTree = useMemo(() => {
    const orderMap = new Map<number, number>();
    departments.forEach((department, index) => orderMap.set(department.id, index));

    const groupedDepartments = new Map<string, { id: number | null; name: string; positions: PositionOption[] }>();
    positions.forEach((position) => {
      const departmentKey = `${position.department_id ?? 'none'}:${position.department_name}`;
      const existing = groupedDepartments.get(departmentKey);
      if (existing) {
        existing.positions.push(position);
        return;
      }

      groupedDepartments.set(departmentKey, {
        id: position.department_id,
        name: position.department_name || 'Без цеха',
        positions: [position],
      });
    });

    return Array.from(groupedDepartments.values())
      .map((department) => ({
        ...department,
        positions: [...department.positions].sort((left, right) => left.position_name.localeCompare(right.position_name, 'ru')),
      }))
      .sort((left, right) => {
        const leftOrder = left.id !== null ? orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
        const rightOrder = right.id !== null ? orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left.name.localeCompare(right.name, 'ru');
      });
  }, [departments, positions]);

  const positionButtonLabel = useMemo(() => {
    if (editingRuleId !== null) {
      if (selectedPositionEntries[0]) {
        const entry = selectedPositionEntries[0];
        return entry.department_name ? `${entry.position_name} (${entry.department_name})` : entry.position_name;
      }
      return 'Выберите должность';
    }
    if (isAllPositionsSelected) {
      return 'Выбраны все должности';
    }
    if (selectedPositionKeys.length === 0) {
      return 'Выберите цех и должность';
    }
    if (selectedPositionEntries.length === 1) {
      const entry = selectedPositionEntries[0];
      return entry.department_name ? `${entry.position_name} (${entry.department_name})` : entry.position_name;
    }
    return `Выбрано должностей: ${selectedPositionKeys.length}`;
  }, [editingRuleId, isAllPositionsSelected, selectedPositionEntries, selectedPositionKeys]);

  const filteredRules = useMemo(() => {
    const normalizedDepartmentSearch = departmentSearch.trim().toLowerCase();
    const normalizedPositionSearch = positionSearch.trim().toLowerCase();

    return rules
      .filter((rule) => {
        const resolvedDepartmentName = getRuleDepartmentName(rule);
        const matchesDepartment = !normalizedDepartmentSearch
          || resolvedDepartmentName.toLowerCase().includes(normalizedDepartmentSearch);
        const matchesPosition = !normalizedPositionSearch
          || rule.position_name.toLowerCase().includes(normalizedPositionSearch);

        return matchesDepartment && matchesPosition;
      })
      .sort((left, right) => {
        const leftHasDepartmentId = left.department_service_id !== null && left.department_service_id !== undefined;
        const rightHasDepartmentId = right.department_service_id !== null && right.department_service_id !== undefined;

        if (leftHasDepartmentId !== rightHasDepartmentId) {
          return leftHasDepartmentId ? -1 : 1;
        }

        const leftDepartmentOrder = leftHasDepartmentId
          ? departmentOrderMap.get(left.department_service_id as number) ?? Number.MAX_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;
        const rightDepartmentOrder = rightHasDepartmentId
          ? departmentOrderMap.get(right.department_service_id as number) ?? Number.MAX_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;

        if (leftDepartmentOrder !== rightDepartmentOrder) {
          return leftDepartmentOrder - rightDepartmentOrder;
        }

        const departmentCompare = getRuleDepartmentName(left).localeCompare(getRuleDepartmentName(right), 'ru');
        if (departmentCompare !== 0) {
          return departmentCompare;
        }

        const positionCompare = left.position_name.localeCompare(right.position_name, 'ru');
        if (positionCompare !== 0) {
          return positionCompare;
        }

        return left.ppeproduct_name.localeCompare(right.ppeproduct_name, 'ru');
      });
  }, [departmentNameMap, departmentOrderMap, departmentSearch, positionSearch, rules]);

  const groupedRules = useMemo<DepartmentPPERuleGroup[]>(() => {
    const groups = new Map<string, DepartmentPPERuleGroup>();

    filteredRules.forEach((rule) => {
      const departmentName = getRuleDepartmentName(rule);
      const departmentId = rule.department_service_id ?? null;
      const groupKey = `${departmentId ?? 'none'}:${departmentName}:${rule.position_name}`;
      const existingGroup = groups.get(groupKey);

      if (existingGroup) {
        existingGroup.items.push(rule);
        return;
      }

      groups.set(groupKey, {
        key: groupKey,
        department_service_id: departmentId,
        department_name: departmentName,
        position_name: rule.position_name,
        items: [rule],
      });
    });

    return Array.from(groups.values());
  }, [filteredRules]);

  const productsForBulkEdit = useMemo(
    () => products.filter((product) => product.is_active !== false).sort((left, right) => left.name.localeCompare(right.name, 'ru')),
    [products],
  );

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
    if (selectedPositionKeys.length === 0) {
      toast.warning('Выберите хотя бы одну должность');
      return;
    }

    try {
      if (editingRuleId !== null) {
        const selectedEntry = selectedPositionEntries[0];
        if (!selectedEntry) {
          toast.warning('Выберите должность');
          return;
        }

        if (!productId) {
          toast.warning('Выберите средство защиты');
          return;
        }

        const payload = {
          department_service_id: selectedEntry.department_id,
          department_name: selectedEntry.department_name,
          position_name: selectedEntry.position_name,
          ppeproduct: Number(productId),
          renewal_months: Number(renewalMonths || 0),
        };
        const response = await axioss.put(`/settings/ppe-department-rules/${editingRuleId}/`, payload);
        setRules((prev) => prev.map((item) => (item.id === editingRuleId ? response.data : item)));
        toast.success('Норма обновлена');
      } else {
        const productRules = Object.entries(productMonths)
          .map(([key, value]) => ({
            ppeproduct: Number(key),
            renewal_months: Number(String(value).trim()),
          }))
          .filter((item) => Number.isFinite(item.renewal_months));

        if (productRules.length === 0) {
          toast.warning('Укажите срок выдачи хотя бы для одного СИЗ');
          return;
        }

        const payload = {
          position_entries: selectedPositionEntries.map((entry) => ({
            department_service_id: entry.department_id,
            department_name: entry.department_name,
            position_name: entry.position_name,
          })),
          product_rules: productRules,
        };
        const response = await axioss.post('/settings/ppe-department-rules/', payload);
        const createdRules = Array.isArray(response.data) ? response.data : [response.data];
        setRules((prev) => [...prev, ...createdRules]);
        toast.success(createdRules.length > 1 ? 'Нормы добавлены' : 'Норма добавлена');
      }

      setSelectedPositionKeys([]);
      setProductId('');
      setRenewalMonths('');
      setProductMonths({});
      setEditingRuleId(null);
      setIsTreeDropdownOpen(false);
    } catch (error) {
      toast.error(getBackendError(error, editingRuleId !== null ? 'Ошибка при обновлении нормы' : 'Ошибка при добавлении нормы'));
    }
  };

  const handleEdit = (rule: DepartmentPPERule) => {
    const matchedPosition = positions.find(
      (position) => position.position_name === rule.position_name && (position.department_id ?? null) === (rule.department_service_id ?? null),
    );

    setEditingRuleId(rule.id);
    setSelectedPositionKeys([
      matchedPosition?.selection_key
        || `${rule.department_service_id ?? 'none'}:${rule.position_name.toLowerCase().trim().replace(/\s+/g, '-')}`,
    ]);
    setProductId(String(rule.ppeproduct));
    setRenewalMonths(String(rule.renewal_months));
    setProductMonths({});
    setIsTreeDropdownOpen(false);
  };

  const togglePosition = (selectionKey: string) => {
    setSelectedPositionKeys((prev) => {
      if (editingRuleId !== null) {
        return prev.includes(selectionKey) ? [] : [selectionKey];
      }
      return prev.includes(selectionKey)
        ? prev.filter((item) => item !== selectionKey)
        : [...prev, selectionKey];
    });
  };

  const getDepartmentPositions = (departmentId: number | null, departmentName: string) => (
    positions.filter((position) => (position.department_id ?? null) === departmentId && position.department_name === departmentName)
  );

  const isDepartmentChecked = (departmentId: number | null, departmentName: string) => {
    const departmentPositions = getDepartmentPositions(departmentId, departmentName);
    return departmentPositions.length > 0
      && departmentPositions.every((position) => selectedPositionKeys.includes(position.selection_key));
  };

  const isDepartmentIndeterminate = (departmentId: number | null, departmentName: string) => {
    const departmentPositions = getDepartmentPositions(departmentId, departmentName);
    const selectedCount = departmentPositions.filter((position) => selectedPositionKeys.includes(position.selection_key)).length;
    return selectedCount > 0 && selectedCount < departmentPositions.length;
  };

  const toggleDepartmentPositions = (departmentId: number | null, departmentName: string) => {
    if (editingRuleId !== null) {
      return;
    }

    const departmentPositionKeys = getDepartmentPositions(departmentId, departmentName).map((position) => position.selection_key);
    setSelectedPositionKeys((prev) => {
      const current = new Set(prev);
      const shouldClear = departmentPositionKeys.every((positionKey) => current.has(positionKey));

      if (shouldClear) {
        departmentPositionKeys.forEach((positionKey) => current.delete(positionKey));
      } else {
        departmentPositionKeys.forEach((positionKey) => current.add(positionKey));
      }

      return Array.from(current);
    });
  };

  const toggleAllPositions = () => {
    if (editingRuleId !== null) return;
    setSelectedPositionKeys(isAllPositionsSelected ? [] : positions.map((position) => position.selection_key));
  };

  const confirmDelete = async () => {
    if (!ruleToDelete) return;

    setDeleteLoading(true);
    try {
      await axioss.delete(`/settings/ppe-department-rules/${ruleToDelete.id}/`);
      setRules((prev) => prev.filter((item) => item.id !== ruleToDelete.id));
      if (editingRuleId === ruleToDelete.id) {
        setEditingRuleId(null);
        setSelectedPositionKeys([]);
        setProductId('');
        setRenewalMonths('');
        setIsTreeDropdownOpen(false);
      }
      setRuleToDelete(null);
      toast.success('Норма удалена');
    } catch (error) {
      toast.error(getBackendError(error, 'Ошибка при удалении нормы'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setSelectedPositionKeys([]);
    setProductId('');
    setRenewalMonths('');
    setProductMonths({});
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
                              checked={isDepartmentChecked(department.id, department.name)}
                              ref={(input) => {
                                if (input) {
                                  input.indeterminate = isDepartmentIndeterminate(department.id, department.name);
                                }
                              }}
                              onChange={() => toggleDepartmentPositions(department.id, department.name)}
                              className="mt-1"
                              disabled={editingRuleId !== null}
                            />
                            <span>{department.name}</span>
                          </label>

                          <div className="mt-2 space-y-2 pl-6">
                            {department.positions.map((position) => {
                              const isChecked = selectedPositionKeys.includes(position.selection_key);
                              return (
                                <label key={position.selection_key} className="flex items-start gap-2 text-sm text-black dark:text-white">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePosition(position.selection_key)}
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

              {editingRuleId !== null ? (
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
              ) : (
                <div className="rounded border border-stroke px-3 py-2 text-sm text-slate-600 dark:border-strokedark dark:text-slate-300">
                  Для выбранных должностей можно сразу указать сроки по всем СИЗ ниже.
                </div>
              )}
            </div>

            {selectedPositionKeys.length > 0 && (
              <div className="rounded border border-dashed border-stroke px-3 py-2 text-sm text-slate-600 dark:border-strokedark dark:text-slate-300">
                Выбрано должностей: {selectedPositionKeys.length}
              </div>
            )}

            {editingRuleId !== null ? (
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
            ) : (
              <div className="rounded border border-stroke p-4 dark:border-strokedark">
                <div className="mb-3 text-sm font-medium text-black dark:text-white">Срок выдачи по СИЗ</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {productsForBulkEdit.map((product) => (
                    <label key={product.id} className="rounded border border-stroke p-3 dark:border-strokedark">
                      <div className="mb-2 text-sm text-black dark:text-white">{product.name}</div>
                      <input
                        type="number"
                        min={0}
                        value={productMonths[product.id] || ''}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setProductMonths((prev) => {
                            if (nextValue === '') {
                              const nextState = { ...prev };
                              delete nextState[product.id];
                              return nextState;
                            }
                            return { ...prev, [product.id]: nextValue };
                          });
                        }}
                        placeholder="Срок выдачи (мес.)"
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 dark:border-strokedark dark:bg-transparent"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

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
            {groupedRules.length === 0 ? (
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
                  {groupedRules.map((group) => (
                    <tr key={group.key} className="border-t border-stroke align-top dark:border-strokedark">
                      <td className="px-3 py-2">{group.department_name || '-'}</td>
                      <td className="px-3 py-2">{group.position_name}</td>
                      <td className="px-3 py-2">
                        <div className="space-y-2">
                          {group.items.map((rule) => (
                            <div key={rule.id} className="min-h-[28px]">{rule.ppeproduct_name}</div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-2">
                          {group.items.map((rule) => (
                            <div key={rule.id} className="min-h-[28px]">{rule.ppeproduct_target_gender_display || 'Для всех'}</div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-2">
                          {group.items.map((rule) => (
                            <div key={rule.id} className="min-h-[28px]">{rule.ppeproduct_type_product || '-'}</div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-2">
                          {group.items.map((rule) => (
                            <div key={rule.id} className="min-h-[28px]">{rule.renewal_months}</div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-2">
                          {group.items.map((rule) => (
                            <div key={rule.id} className="flex min-h-[28px] items-center gap-2">
                              <button
                                onClick={() => handleEdit(rule)}
                                className="rounded border border-stroke px-2 py-1 text-xs dark:border-strokedark"
                              >
                                Изменить
                              </button>
                              <button
                                onClick={() => setRuleToDelete(rule)}
                                className={`inline-flex items-center justify-center rounded border px-2 py-1 text-xs ${isAdmin ? 'border-red-400 text-red-600' : 'cursor-not-allowed border-slate-300 text-slate-400 dark:border-strokedark dark:text-slate-500'}`}
                                title={isAdmin ? 'Удалить' : 'Удаление доступно только администратору'}
                                disabled={!isAdmin}
                              >
                                <FiTrash2 className="text-sm" />
                              </button>
                            </div>
                          ))}
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

      <Modal show={Boolean(ruleToDelete)} onClose={() => !deleteLoading && setRuleToDelete(null)}>
        <Modal.Header>Подтвердите удаление</Modal.Header>
        <Modal.Body>
          <div className="space-y-3">
            <div className="flex justify-center text-red-500">
              <FiAlertTriangle className="h-16 w-16" />
            </div>
            <p className="text-center text-base text-slate-600 dark:text-slate-300">
              {ruleToDelete
                ? `Удалить норму для должности "${ruleToDelete.position_name}" и СИЗ "${ruleToDelete.ppeproduct_name}"?`
                : 'Удалить выбранную норму?'}
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button color="gray" onClick={() => setRuleToDelete(null)} disabled={deleteLoading}>
            Отмена
          </Button>
          <Button color="failure" onClick={confirmDelete} disabled={deleteLoading}>
            {deleteLoading ? 'Удаление...' : 'Удалить'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default DepartmentPPERulePage;