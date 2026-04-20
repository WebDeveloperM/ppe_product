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
  if (Array.isArray(data) && data.length > 0) {
    const firstItem = data[0];
    if (typeof firstItem === 'string' && firstItem.trim()) return firstItem;
    if (firstItem && typeof firstItem === 'object') {
      const firstNestedField = Object.values(firstItem)[0];
      if (Array.isArray(firstNestedField) && firstNestedField.length) {
        return String(firstNestedField[0]);
      }
      if (typeof firstNestedField === 'string' && firstNestedField.trim()) {
        return firstNestedField;
      }
    }
  }
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
  const [productMonths, setProductMonths] = useState<Record<number, string>>({});
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [positionSearch, setPositionSearch] = useState('');
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<DepartmentPPERuleGroup | null>(null);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
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

  const findExistingRule = (departmentId: number | null, positionName: string, ppeproductId: number) => {
    const normalizedPositionName = positionName.trim().toLowerCase();
    return rules.find((rule) => (
      (rule.department_service_id ?? null) === departmentId
      && rule.position_name.trim().toLowerCase() === normalizedPositionName
      && rule.ppeproduct === ppeproductId
    ));
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
  }, [departmentOrderMap, departmentSearch, positionSearch, rules]);

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

  const editingGroup = useMemo(
    () => groupedRules.find((group) => group.key === editingGroupKey) ?? null,
    [editingGroupKey, groupedRules],
  );

  const selectedGroups = useMemo(
    () => groupedRules.filter((group) => selectedGroupKeys.includes(group.key)),
    [groupedRules, selectedGroupKeys],
  );

  const isAllVisibleGroupsSelected = groupedRules.length > 0 && groupedRules.every((group) => selectedGroupKeys.includes(group.key));

  const positionButtonLabel = useMemo(() => {
    if (editingGroup !== null) {
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
  }, [editingGroup, isAllPositionsSelected, selectedPositionEntries, selectedPositionKeys]);

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

  const resetForm = () => {
    setSelectedPositionKeys([]);
    setProductMonths({});
    setEditingGroupKey(null);
    setIsTreeDropdownOpen(false);
  };

  const toggleGroupSelection = (groupKey: string) => {
    setSelectedGroupKeys((prev) => (
      prev.includes(groupKey)
        ? prev.filter((item) => item !== groupKey)
        : [...prev, groupKey]
    ));
  };

  const toggleSelectAllVisibleGroups = () => {
    setSelectedGroupKeys((prev) => {
      if (groupedRules.length === 0) {
        return prev;
      }

      const visibleKeys = groupedRules.map((group) => group.key);
      const allSelected = visibleKeys.every((key) => prev.includes(key));
      if (allSelected) {
        return prev.filter((key) => !visibleKeys.includes(key));
      }

      return Array.from(new Set([...prev, ...visibleKeys]));
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedPositionKeys.length === 0) {
      toast.warning('Выберите хотя бы одну должность');
      return;
    }

    const selectedEntry = selectedPositionEntries[0];
    if (!selectedEntry) {
      toast.warning('Выберите должность');
      return;
    }

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

    try {
      if (editingGroup !== null) {
        const existingRulesByProduct = new Map(editingGroup.items.map((rule) => [rule.ppeproduct, rule]));
        const nextProductIds = new Set(productRules.map((item) => item.ppeproduct));

        const updateRequests = productRules
          .filter((item) => existingRulesByProduct.has(item.ppeproduct))
          .map((item) => {
            const existingRule = existingRulesByProduct.get(item.ppeproduct)!;
            return axioss.put(`/settings/ppe-department-rules/${existingRule.id}/`, {
              department_service_id: selectedEntry.department_id,
              department_name: selectedEntry.department_name,
              position_name: selectedEntry.position_name,
              ppeproduct: item.ppeproduct,
              renewal_months: item.renewal_months,
            });
          });

        const createPayload = productRules
          .filter((item) => !existingRulesByProduct.has(item.ppeproduct))
          .map((item) => ({
            ppeproduct: item.ppeproduct,
            renewal_months: item.renewal_months,
          }));

        const deleteRequests = editingGroup.items
          .filter((rule) => !nextProductIds.has(rule.ppeproduct))
          .map((rule) => axioss.delete(`/settings/ppe-department-rules/${rule.id}/`));

        const [updatedResponses, createdResponse] = await Promise.all([
          Promise.all(updateRequests),
          createPayload.length > 0
            ? axioss.post('/settings/ppe-department-rules/', {
              position_entries: [{
                department_service_id: selectedEntry.department_id,
                department_name: selectedEntry.department_name,
                position_name: selectedEntry.position_name,
              }],
              product_rules: createPayload,
            })
            : Promise.resolve(null),
        ]);

        await Promise.all(deleteRequests);

        const updatedRules = updatedResponses.map((response) => response.data as DepartmentPPERule);
        const createdRules = createdResponse
          ? ((Array.isArray(createdResponse.data) ? createdResponse.data : [createdResponse.data]) as DepartmentPPERule[])
          : [];
        const deletedRuleIds = new Set(
          editingGroup.items.filter((rule) => !nextProductIds.has(rule.ppeproduct)).map((rule) => rule.id),
        );

        setRules((prev) => {
          const remaining = prev.filter((item) => !deletedRuleIds.has(item.id));
          const merged = remaining.map((item) => updatedRules.find((updatedItem) => updatedItem.id === item.id) ?? item);
          return [...merged, ...createdRules];
        });
        toast.success('Нормы обновлены');
      } else {
        const updateRequests: Promise<any>[] = [];
        const createRequests: Promise<any>[] = [];

        selectedPositionEntries.forEach((entry) => {
          const missingProductRules: Array<{ ppeproduct: number; renewal_months: number }> = [];

          productRules.forEach((productRule) => {
            const existingRule = findExistingRule(entry.department_id ?? null, entry.position_name, productRule.ppeproduct);
            if (existingRule) {
              updateRequests.push(
                axioss.put(`/settings/ppe-department-rules/${existingRule.id}/`, {
                  department_service_id: entry.department_id,
                  department_name: entry.department_name,
                  position_name: entry.position_name,
                  ppeproduct: productRule.ppeproduct,
                  renewal_months: productRule.renewal_months,
                }),
              );
            } else {
              missingProductRules.push(productRule);
            }
          });

          if (missingProductRules.length > 0) {
            createRequests.push(
              axioss.post('/settings/ppe-department-rules/', {
                position_entries: [{
                  department_service_id: entry.department_id,
                  department_name: entry.department_name,
                  position_name: entry.position_name,
                }],
                product_rules: missingProductRules,
              }),
            );
          }
        });

        const [updatedResponses, createdResponses] = await Promise.all([
          Promise.all(updateRequests),
          Promise.all(createRequests),
        ]);

        const updatedRules = updatedResponses.map((response) => response.data as DepartmentPPERule);
        const createdRules = createdResponses.flatMap((response) => (
          Array.isArray(response.data) ? response.data : [response.data]
        )) as DepartmentPPERule[];

        setRules((prev) => {
          const merged = prev.map((item) => updatedRules.find((updatedItem) => updatedItem.id === item.id) ?? item);
          const existingIds = new Set(merged.map((item) => item.id));
          const nextCreatedRules = createdRules.filter((item) => !existingIds.has(item.id));
          return [...merged, ...nextCreatedRules];
        });

        const affectedCount = updatedRules.length + createdRules.length;
        toast.success(affectedCount > 1 ? 'Нормы сохранены' : 'Норма сохранена');
      }

      resetForm();
    } catch (error) {
      toast.error(getBackendError(error, editingGroup !== null ? 'Ошибка при обновлении норм' : 'Ошибка при добавлении нормы'));
    }
  };

  const handleGroupEdit = (group: DepartmentPPERuleGroup) => {
    const firstRule = group.items[0];
    if (!firstRule) {
      return;
    }

    const matchedPosition = positions.find(
      (position) => position.position_name === firstRule.position_name && (position.department_id ?? null) === (firstRule.department_service_id ?? null),
    );

    setEditingGroupKey(group.key);
    setSelectedPositionKeys([
      matchedPosition?.selection_key
        || `${firstRule.department_service_id ?? 'none'}:${firstRule.position_name.toLowerCase().trim().replace(/\s+/g, '-')}`,
    ]);
    setProductMonths(
      group.items.reduce<Record<number, string>>((accumulator, item) => {
        accumulator[item.ppeproduct] = String(item.renewal_months);
        return accumulator;
      }, {}),
    );
    setIsTreeDropdownOpen(false);
  };

  const togglePosition = (selectionKey: string) => {
    setSelectedPositionKeys((prev) => {
      if (editingGroup !== null) {
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
    if (editingGroup !== null) {
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
    if (editingGroup !== null) return;
    setSelectedPositionKeys(isAllPositionsSelected ? [] : positions.map((position) => position.selection_key));
  };

  const confirmGroupDelete = async () => {
    if (!groupToDelete) return;

    setDeleteLoading(true);
    try {
      await Promise.all(groupToDelete.items.map((rule) => axioss.delete(`/settings/ppe-department-rules/${rule.id}/`)));

      const deletedIds = new Set(groupToDelete.items.map((rule) => rule.id));
      setRules((prev) => prev.filter((item) => !deletedIds.has(item.id)));

      if (editingGroupKey !== null && editingGroupKey === groupToDelete.key) {
        resetForm();
      }

      setSelectedGroupKeys((prev) => prev.filter((key) => key !== groupToDelete.key));
      setGroupToDelete(null);
      toast.success('Нормы по выбранному цеху и должности удалены');
    } catch (error) {
      toast.error(getBackendError(error, 'Ошибка при удалении норм'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteSelectedGroups = async () => {
    if (selectedGroups.length === 0) {
      toast.warning('Выберите хотя бы одну строку');
      return;
    }

    setDeleteLoading(true);
    try {
      await Promise.all(
        selectedGroups.flatMap((group) => group.items.map((rule) => axioss.delete(`/settings/ppe-department-rules/${rule.id}/`))),
      );

      const deletedIds = new Set(selectedGroups.flatMap((group) => group.items.map((rule) => rule.id)));
      const deletedGroupKeys = new Set(selectedGroups.map((group) => group.key));
      setRules((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      setSelectedGroupKeys((prev) => prev.filter((key) => !deletedGroupKeys.has(key)));

      if (editingGroupKey !== null && deletedGroupKeys.has(editingGroupKey)) {
        resetForm();
      }

      toast.success('Танланган нормалар ўчирилди');
    } catch (error) {
      toast.error(getBackendError(error, 'Танланган нормаларни ўчиришда хатолик'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const openBulkDeleteModal = () => {
    if (selectedGroups.length === 0) {
      toast.warning('Выберите хотя бы одну строку');
      return;
    }
    setIsBulkDeleteModalOpen(true);
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
                      {editingGroup !== null ? 'Выберите должность' : 'Выберите цех и одну или несколько должностей'}
                    </div>

                    {editingGroup === null && positions.length > 0 && (
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
                              disabled={editingGroup !== null}
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

              <div className="rounded border border-stroke px-3 py-2 text-sm text-slate-600 dark:border-strokedark dark:text-slate-300">
                {editingGroup !== null
                  ? 'Редактирование группы: измените сроки по нужным СИЗ. Пустое поле удалит норму для этого СИЗ.'
                  : 'Для выбранных должностей можно сразу указать сроки по всем СИЗ ниже.'}
              </div>
            </div>

            {selectedPositionKeys.length > 0 && (
              <div className="rounded border border-dashed border-stroke px-3 py-2 text-sm text-slate-600 dark:border-strokedark dark:text-slate-300">
                Выбрано должностей: {selectedPositionKeys.length}
              </div>
            )}

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

            <div className="flex gap-2">
              <button type="submit" className="rounded bg-primary px-4 py-2 text-white">
                {editingGroup !== null ? 'Сохранить' : 'Добавить'}
              </button>
              {editingGroup !== null && (
                <button
                  type="button"
                  onClick={resetForm}
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

          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Танланган қаторлар: {selectedGroups.length}
            </div>
            <button
              type="button"
              onClick={openBulkDeleteModal}
              disabled={!isAdmin || selectedGroups.length === 0 || deleteLoading}
              className={`rounded px-4 py-2 text-sm ${isAdmin && selectedGroups.length > 0 && !deleteLoading ? 'bg-red-600 text-white' : 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}
            >
              {deleteLoading ? 'Удаление...' : 'Удалить выбранные'}
            </button>
          </div>

          <div className="max-h-96 overflow-auto">
            {groupedRules.length === 0 ? (
              <p className="text-center text-gray-500">Нет данных</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">№</th>
                    <th className="px-3 py-2 text-left font-semibold">Цех</th>
                    <th className="px-3 py-2 text-left font-semibold">Должность</th>
                    <th className="px-3 py-2 text-left font-semibold">СИЗ</th>
                    <th className="px-3 py-2 text-left font-semibold">Для кого</th>
                    <th className="px-3 py-2 text-left font-semibold">Тип</th>
                    <th className="px-3 py-2 text-left font-semibold">Срок (мес.)</th>
                    <th className="px-3 py-2 text-left font-semibold">Действия</th>
                    <th className="px-3 py-2 text-center font-semibold">
                      <input
                        type="checkbox"
                        checked={isAllVisibleGroupsSelected}
                        onChange={toggleSelectAllVisibleGroups}
                        aria-label="Выбрать все строки"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRules.map((group, index) => (
                    <tr key={group.key} className="border-t border-stroke align-top dark:border-strokedark">
                      <td className="px-3 py-2">{index + 1}</td>
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleGroupEdit(group)}
                            className="rounded border border-stroke px-2 py-1 text-xs dark:border-strokedark"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={() => setGroupToDelete(group)}
                            className={`inline-flex items-center justify-center rounded border px-2 py-1 text-xs ${isAdmin ? 'border-red-400 text-red-600' : 'cursor-not-allowed border-slate-300 text-slate-400 dark:border-strokedark dark:text-slate-500'}`}
                            title={isAdmin ? 'Удалить' : 'Удаление доступно только администратору'}
                            disabled={!isAdmin}
                          >
                            <FiTrash2 className="text-sm" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center align-top">
                        <input
                          type="checkbox"
                          checked={selectedGroupKeys.includes(group.key)}
                          onChange={() => toggleGroupSelection(group.key)}
                          aria-label={`Выбрать ${group.department_name} ${group.position_name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <Modal show={Boolean(groupToDelete)} onClose={() => !deleteLoading && setGroupToDelete(null)}>
        <Modal.Header>Подтвердите удаление группы</Modal.Header>
        <Modal.Body>
          <div className="space-y-3">
            <div className="flex justify-center text-red-500">
              <FiAlertTriangle className="h-16 w-16" />
            </div>
            <p className="text-center text-base text-slate-600 dark:text-slate-300">
              {groupToDelete
                ? `Удалить все нормы для должности "${groupToDelete.position_name}" в цехе "${groupToDelete.department_name || '-'}"?`
                : 'Удалить выбранную группу норм?'}
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button color="gray" onClick={() => setGroupToDelete(null)} disabled={deleteLoading}>
            Отмена
          </Button>
          <Button color="failure" onClick={confirmGroupDelete} disabled={deleteLoading}>
            {deleteLoading ? 'Удаление...' : 'Удалить все'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={isBulkDeleteModalOpen} onClose={() => !deleteLoading && setIsBulkDeleteModalOpen(false)}>
        <Modal.Header>Подтвердите массовое удаление</Modal.Header>
        <Modal.Body>
          <div className="space-y-3">
            <div className="flex justify-center text-red-500">
              <FiAlertTriangle className="h-16 w-16" />
            </div>
            <p className="text-center text-base text-slate-600 dark:text-slate-300">
              {`Подтвердите удаление ${selectedGroups.length} выбранных групп?`}
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button color="gray" onClick={() => setIsBulkDeleteModalOpen(false)} disabled={deleteLoading}>
            Отмена
          </Button>
          <Button
            color="failure"
            onClick={async () => {
              await handleDeleteSelectedGroups();
              if (!deleteLoading) {
                setIsBulkDeleteModalOpen(false);
              }
            }}
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Удаление...' : 'Удалить'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default DepartmentPPERulePage;