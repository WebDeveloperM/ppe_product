import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import axioss from '../../api/axios';
import { BASE_URL } from '../../utils/urls';
import { toast } from 'react-toastify';
import { FaFileExcel } from 'react-icons/fa';
import * as XLSX from 'xlsx-js-style';
import { getStoredFeatureAccess, normalizeRole } from '../../utils/pageAccess';

// ─── Types ───────────────────────────────────────────────────────────────────

type DueSoonProduct = {
  id: number;
  name: string;
  due_count: number;
};

type DueSoonRow = {
  item_id: number;
  item_slug: string | null;
  employee_id: number;
  employee_slug: string | null;
  employee_name: string;
  tabel_number: string;
  department_name: string;
  section_name: string;
  position: string;
  product_id: number;
  product_name: string;
  size: string;
  issued_at: string | null;
  due_date: string | null;
  days_remaining: number;
  remaining_text: string;
};

type DueSoonSummaryRow = {
  product_id: number;
  product_name: string;
  size: string;
  count: number;
  label: string;
  quantity_text: string;
  requirement_text: string;
};

type DueSoonResponse = {
  due_days: number;
  selected_product_id: number | null;
  search: string;
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
  products: DueSoonProduct[];
  summary: DueSoonSummaryRow[];
  results: DueSoonRow[];
};

type DueSoonTab = 'employees' | 'summary';

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTH_OPTIONS = [1, 2, 3, 6, 12];
const PAGE_SIZE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const parseMonthParam = (raw: string | null): number => {
  const parsed = Number(raw);
  return MONTH_OPTIONS.includes(parsed) ? parsed : 1;
};

const parsePageParam = (raw: string | null): number => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

// ─── Pagination bar ───────────────────────────────────────────────────────────

type PaginationProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  loading: boolean;
  onChange: (next: number) => void;
};

const PaginationBar = ({ page, totalPages, totalCount, pageSize, loading, onChange }: PaginationProps) => {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  // Page window: always show first, last, current ±2
  const pages: (number | '...')[] = [];
  const add = (n: number) => {
    if (n < 1 || n > totalPages) return;
    if (pages[pages.length - 1] === n) return;
    pages.push(n);
  };
  const ellipsis = () => {
    if (pages[pages.length - 1] !== '...') pages.push('...');
  };

  add(1);
  if (page > 4) ellipsis();
  for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) add(i);
  if (page < totalPages - 3) ellipsis();
  add(totalPages);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stroke pt-3 text-sm dark:border-strokedark">
      <span className="text-slate-500 dark:text-slate-400">
        {from}–{to} / {totalCount} запись
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onChange(page - 1)}
          className="rounded border border-stroke px-2.5 py-1 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-strokedark dark:text-slate-300"
        >
          ‹
        </button>

        {pages.map((p, idx) =>
          p === '...' ? (
            <span key={`dot-${idx}`} className="px-1 text-slate-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              disabled={loading}
              onClick={() => onChange(p as number)}
              className={`rounded border px-2.5 py-1 transition ${
                p === page
                  ? 'border-primary bg-primary text-white'
                  : 'border-stroke text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-strokedark dark:text-slate-300'
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onChange(page + 1)}
          className="rounded border border-stroke px-2.5 py-1 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-strokedark dark:text-slate-300"
        >
          ›
        </button>
      </div>
    </div>
  );
};

// ─── Page component ───────────────────────────────────────────────────────────

const DueSoonPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = normalizeRole(localStorage.getItem('role'));
  const canExportExcel = getStoredFeatureAccess(role).dashboard_export_excel;

  const [activeTab, setActiveTab] = useState<DueSoonTab>('employees');

  // Filter state — read initial values from URL
  const [dueMonths, setDueMonths] = useState<number>(() => parseMonthParam(searchParams.get('dueMonths')));
  const [selectedProductId, setSelectedProductId] = useState<string>(() => searchParams.get('productId') || '');
  const [search, setSearch] = useState<string>(() => searchParams.get('search') || '');
  const [page, setPage] = useState<number>(() => parsePageParam(searchParams.get('page')));

  // Debounced search value — API fires only 500ms after typing stops
  const [debouncedSearch, setDebouncedSearch] = useState<string>(() => searchParams.get('search') || '');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AbortController ref — cancels the previous in-flight request when params change
  const abortRef = useRef<AbortController | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [payload, setPayload] = useState<DueSoonResponse | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
    }, 500);
  };

  const handleMonthsChange = (months: number) => {
    setDueMonths(months);
    setPage(1);
  };

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    setPage(1);
  };

  // ── Sync URL ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('dueMonths', String(dueMonths));
    if (selectedProductId) next.set('productId', selectedProductId);
    if (debouncedSearch) next.set('search', debouncedSearch);
    if (page > 1) next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [dueMonths, debouncedSearch, selectedProductId, page, setSearchParams]);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchRows = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('due_days', String(dueMonths * 30));
        params.set('page', String(page));
        params.set('page_size', String(PAGE_SIZE));
        if (selectedProductId) params.set('product_id', selectedProductId);
        if (debouncedSearch) params.set('search', debouncedSearch);

        const response = await axioss.get(`${BASE_URL}/due-soon-employees/?${params.toString()}`, {
          signal: controller.signal,
        });
        setPayload(response.data as DueSoonResponse);
      } catch (error: any) {
        // Ignore cancelled requests — a new one is already in flight
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
        const backendError = error?.response?.data?.error;
        toast.error(backendError || 'Не удалось загрузить список по срокам СИЗ');
      } finally {
        // Only clear loading when THIS request wasn't aborted
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchRows();

    return () => {
      controller.abort();
    };
  }, [dueMonths, page, debouncedSearch, selectedProductId]);

  // Cleanup debounce timer on unmount
  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const totalCount = payload?.total_count ?? 0;
  const totalPages = payload?.total_pages ?? 1;
  const currentPage = payload?.page ?? page;

  const subtitle = useMemo(
    () => `Найдено ${totalCount} записей по сотрудникам, которым скоро потребуется выдача СИЗ.`,
    [totalCount],
  );

  // Summary comes pre-built from backend (covers ALL filtered rows, not just this page)
  const summaryRows = useMemo<DueSoonSummaryRow[]>(() => payload?.summary ?? [], [payload?.summary]);

  // ── Excel export ──────────────────────────────────────────────────────────

  const exportDueSoonToExcel = () => {
    const detailRows = payload?.results || [];
    const hasData = activeTab === 'employees' ? detailRows.length > 0 : summaryRows.length > 0;

    if (!hasData) {
      toast.info('Экспортировать нечего');
      return;
    }

    try {
      const headers =
        activeTab === 'employees'
          ? ['№', 'Табельный номер', 'Сотрудник', 'Нужный СИЗ', 'Размер', 'Цех', 'Отдел', 'Должность', 'Дата выдачи', 'Следующая выдача', 'Осталось']
          : ['№', 'Средство защиты', 'Количество'];

      const offset = (currentPage - 1) * PAGE_SIZE;
      const body =
        activeTab === 'employees'
          ? detailRows.map((row, idx) => [
              offset + idx + 1,
              row.tabel_number || '-',
              row.employee_name || '-',
              row.product_name || '-',
              row.size || '-',
              row.department_name || '-',
              row.section_name || '-',
              row.position || '-',
              formatDateTime(row.issued_at),
              formatDateTime(row.due_date),
              row.remaining_text || '-',
            ])
          : summaryRows.map((row, idx) => [idx + 1, row.label, row.quantity_text]);

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
      worksheet['!cols'] =
        activeTab === 'employees'
          ? [{ wch: 6 }, { wch: 18 }, { wch: 30 }, { wch: 24 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 16 }]
          : [{ wch: 6 }, { wch: 36 }, { wch: 20 }];

      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = worksheet[addr];
          if (!cell) continue;
          const isHeader = r === 0;
          cell.s = {
            font: { bold: isHeader, color: { rgb: isHeader ? 'FFFFFF' : '1E293B' } },
            fill: { fgColor: { rgb: isHeader ? '2563EB' : r % 2 === 0 ? 'FFFFFF' : 'EFF6FF' } },
            alignment: { vertical: 'center', horizontal: c === 0 ? 'center' : 'left', wrapText: true },
            border: {
              top: { style: 'thin', color: { rgb: 'CBD5E1' } },
              bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
              left: { style: 'thin', color: { rgb: 'CBD5E1' } },
              right: { style: 'thin', color: { rgb: 'CBD5E1' } },
            },
          };
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, activeTab === 'employees' ? 'Due Soon PPE' : 'Due Soon Summary');

      const today = new Date().toISOString().slice(0, 10);
      const productPart = selectedProductId ? `product_${selectedProductId}` : 'all';
      const tabPart = activeTab === 'employees' ? 'details' : 'summary';
      XLSX.writeFile(workbook, `due_soon_ppe_${tabPart}_${dueMonths}m_${productPart}_${today}.xlsx`);
      toast.success(`Экспортировано ${activeTab === 'employees' ? detailRows.length : summaryRows.length} записей`);
    } catch (err) {
      console.error('Ошибка экспорта:', err);
      toast.error('Не удалось скачать Excel');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const results = payload?.results ?? [];

  return (
    <>
      <Breadcrumb pageName="Скоро требуется СИЗ" />

      <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">

        {/* ── Header ── */}
        <div className="mb-5 flex flex-col gap-3 border-b border-stroke pb-4 md:flex-row md:items-start md:justify-between dark:border-strokedark">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Сотрудники, которым скоро нужно выдать СИЗ
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canExportExcel && (
              <button
                type="button"
                onClick={exportDueSoonToExcel}
                className="inline-flex items-center gap-2 rounded border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                <FaFileExcel />
                Скачать Excel
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Назад на главную
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="mb-5 grid gap-3 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            Период
            <select
              value={dueMonths}
              onChange={(e) => handleMonthsChange(Number(e.target.value))}
              className="rounded border border-stroke bg-white px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} мес.</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300 lg:col-span-2">
            Средство защиты
            <select
              value={selectedProductId}
              onChange={(e) => handleProductChange(e.target.value)}
              className="rounded border border-stroke bg-white px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
            >
              <option value="">Все СИЗ</option>
              {(payload?.products ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.due_count})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            Поиск
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="ФИО, табель, СИЗ, размер"
              className="rounded border border-stroke bg-white px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
            />
          </label>
        </div>

        {/* ── Tabs ── */}
        <div className="mb-4 flex flex-wrap gap-2 border-b border-stroke pb-3 dark:border-strokedark">
          {(['employees', 'summary'] as DueSoonTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-primary text-white'
                  : 'border border-stroke bg-white text-slate-700 hover:bg-slate-50 dark:border-strokedark dark:bg-boxdark dark:text-slate-200'
              }`}
            >
              {tab === 'employees' ? 'По сотрудникам' : 'Сводка по СИЗ'}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Загрузка...</div>

        ) : activeTab === 'employees' ? (
          results.length ? (
            <>
              <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stroke bg-slate-50 text-left dark:border-strokedark dark:bg-slate-800">
                      <th className="px-3 py-2">№</th>
                      <th className="px-3 py-2">Таб номер</th>
                      <th className="px-3 py-2">Сотрудник</th>
                      <th className="px-3 py-2">Нужный СИЗ</th>
                      <th className="px-3 py-2">Размер</th>
                      <th className="px-3 py-2">Цех</th>
                      <th className="px-3 py-2">Отдел</th>
                      <th className="px-3 py-2">Должность</th>
                      <th className="px-3 py-2">Дата выдачи</th>
                      <th className="px-3 py-2">Следующая выдача</th>
                      <th className="px-3 py-2">Осталось</th>
                      <th className="px-3 py-2">Открыть</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, idx) => (
                      <tr key={`${row.item_id}-${row.product_id}`} className="border-b border-stroke dark:border-strokedark">
                        <td className="px-3 py-2 text-slate-500">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-3 py-2">{row.tabel_number || '-'}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{row.employee_name || '-'}</td>
                        <td className="px-3 py-2">{row.product_name || '-'}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                            {row.size || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2">{row.department_name || '-'}</td>
                        <td className="px-3 py-2">{row.section_name || '-'}</td>
                        <td className="px-3 py-2">{row.position || '-'}</td>
                        <td className="px-3 py-2">{formatDateTime(row.issued_at)}</td>
                        <td className="px-3 py-2 text-amber-700">{formatDateTime(row.due_date)}</td>
                        <td className="px-3 py-2 font-medium text-amber-700">{row.remaining_text || '-'}</td>
                        <td className="px-3 py-2">
                          {row.item_slug ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/item-view/${row.item_slug}`)}
                              className="rounded border border-primary px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary hover:text-white"
                            >
                              Открыть
                            </button>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <PaginationBar
                page={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                loading={loading}
                onChange={setPage}
              />
            </>
          ) : (
            <div className="rounded border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
              В выбранном периоде нет сотрудников с приближающимся сроком выдачи СИЗ.
            </div>
          )

        ) : summaryRows.length ? (
          <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stroke bg-slate-50 text-left dark:border-strokedark dark:bg-slate-800">
                  <th className="px-3 py-2">№</th>
                  <th className="px-3 py-2">Средство защиты</th>
                  <th className="px-3 py-2">Количество</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row, idx) => (
                  <tr key={`${row.product_id}-${row.size}`} className="border-b border-stroke dark:border-strokedark">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{row.label}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {row.quantity_text}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
            В выбранном периоде нет сводных данных по требуемым СИЗ.
          </div>
        )}
      </div>
    </>
  );
};

export default DueSoonPage;
