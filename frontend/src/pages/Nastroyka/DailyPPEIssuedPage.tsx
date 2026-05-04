import { forwardRef, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaRegCalendarAlt } from 'react-icons/fa';
import { FiFilter } from 'react-icons/fi';
import DatePicker from 'react-datepicker';
import * as XLSX from 'xlsx-js-style';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import axioss from '../../api/axios';
import { resolveEmployeeImageUrl } from '../../utils/urls';
import { getStoredFeatureAccess, normalizeRole } from '../../utils/pageAccess';

type EmployeeInfo = {
  id?: number | string;
  slug?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  surname?: string;
  tabel_number?: string;
  position?: string;
  department?: { name?: string };
  section?: { name?: string };
};

type IssueProduct = {
  id: number;
  name: string;
  size?: string;
  type_product_display?: string | null;
};

type DailyIssuedApiRow = {
  id: number;
  issued_at?: string | null;
  signature_image?: string | null;
  qr_code_image?: string | null;
  qr_scan_url?: string | null;
  employee?: EmployeeInfo;
  ppeproduct_info?: IssueProduct[];
};

type DailyIssueRow = {
  key: string;
  employeeSlug: string;
  tabelNumber: string;
  fullName: string;
  issuedAtRaw: string;
  issuedAt: string;
  productsLabel: string;
  productNames: string[];
  signatureImage: string;
  qrCodeImage: string;
  qrScanUrl: string;
};

const getBackendError = (error: any, fallback: string) => {
  const data = error?.response?.data;
  if (!data) return fallback;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  const firstField = Object.values(data)[0];
  if (Array.isArray(firstField) && firstField.length > 0) {
    return String(firstField[0]);
  }
  return fallback;
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatIssuedAt = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const parseIssuedAt = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatReportDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

const buildFullName = (employee?: EmployeeInfo) => {
  const fullName = String(employee?.full_name || '').trim();
  if (fullName) return fullName;
  return [employee?.last_name, employee?.first_name, employee?.surname]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ') || '—';
};

const buildProductsLabel = (products?: IssueProduct[]) => {
  if (!Array.isArray(products) || products.length === 0) return '—';
  return products
    .map((product) => {
      const base = String(product?.name || '').trim();
      const details = [product?.type_product_display, product?.size ? `размер ${product.size}` : '']
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ');
      if (!base) return details || '—';
      return details ? `${base} (${details})` : base;
    })
    .join('; ');
};

const getProductNames = (products?: IssueProduct[]) => {
  if (!Array.isArray(products) || products.length === 0) return [] as string[];
  return products
    .map((product) => String(product?.name || '').trim())
    .filter(Boolean);
};

const DateInput = forwardRef<HTMLInputElement, { value?: string; onClick?: () => void; placeholder?: string }>(
  ({ value, onClick, placeholder }, ref) => (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        value={value ?? ''}
        onClick={onClick}
        readOnly
        placeholder={placeholder}
        className="h-[42px] w-full rounded border border-stroke bg-white px-3 pr-10 text-base text-slate-700 outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark-2 dark:text-slate-200"
      />
      <button
        type="button"
        onClick={onClick}
        className="absolute inset-y-0 right-3 flex items-center text-slate-500"
        aria-label="Открыть календарь"
      >
        <FaRegCalendarAlt />
      </button>
    </div>
  ),
);

DateInput.displayName = 'DateInput';

const DailyPPEIssuedPage = () => {
  const navigate = useNavigate();
  const role = useMemo(() => normalizeRole(localStorage.getItem('role')), []);
  const canSeeDailyPpeIssued = role === 'admin' || role === 'warehouse_manager' || role === 'warehouse_staff';
  const canExportExcel = getStoredFeatureAccess(role).dashboard_export_excel;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DailyIssueRow[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [productFilter, setProductFilter] = useState('');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!canSeeDailyPpeIssued) return;

    const loadReport = async () => {
      setLoading(true);
      try {
        const response = await axioss.get('/daily-issued-items/');

        const payload: DailyIssuedApiRow[] = Array.isArray(response.data) ? response.data : [];
        const nextRows = payload
          .map((item) => {
            const employee = item?.employee;
            return {
              key: `${employee?.id || item.id}-${item.id}`,
              employeeSlug: String(employee?.slug || '').trim(),
              tabelNumber: String(employee?.tabel_number || '').trim() || '—',
              fullName: buildFullName(employee),
              issuedAtRaw: String(item?.issued_at || ''),
              issuedAt: formatIssuedAt(item?.issued_at),
              productsLabel: buildProductsLabel(item?.ppeproduct_info),
              productNames: getProductNames(item?.ppeproduct_info),
              signatureImage: resolveEmployeeImageUrl(item?.signature_image),
              qrCodeImage: resolveEmployeeImageUrl(item?.qr_code_image),
              qrScanUrl: String(item?.qr_scan_url || '').trim(),
            };
          })
          .sort((left, right) => right.issuedAtRaw.localeCompare(left.issuedAtRaw));

        setRows(nextRows);
      } catch (error) {
        toast.error(getBackendError(error, 'Не удалось загрузить ежедневную выдачу СИЗ'));
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [canSeeDailyPpeIssued]);

  const productOptions = useMemo(() => {
    const names = rows.flatMap((row) => row.productNames);
    return Array.from(new Set(names)).sort((left, right) => left.localeCompare(right, 'ru'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (productFilter && !row.productNames.some((name) => name.toLowerCase() === productFilter.toLowerCase())) {
        return false;
      }

      const issuedAtDate = parseIssuedAt(row.issuedAtRaw);
      if (fromDate) {
        if (!issuedAtDate) return false;
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        if (issuedAtDate < startDate) return false;
      }

      if (toDate) {
        if (!issuedAtDate) return false;
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        if (issuedAtDate > endDate) return false;
      }

      return true;
    });
  }, [rows, productFilter, fromDate, toDate]);

  const reportSummary = useMemo(() => {
    const dateBits = [] as string[];
    if (fromDate) dateBits.push(`с ${formatReportDate(formatDateInput(fromDate))}`);
    if (toDate) dateBits.push(`по ${formatReportDate(formatDateInput(toDate))}`);
    if (dateBits.length > 0) {
      return `Отчет ${dateBits.join(' ')}. Всего получателей: ${filteredRows.length}`;
    }
    return `Все записи. Всего получателей: ${filteredRows.length}`;
  }, [filteredRows.length, fromDate, toDate]);

  const exportFilteredRowsToExcel = () => {
    if (!filteredRows.length) {
      toast.info('Экспортировать нечего');
      return;
    }

    setIsExporting(true);

    try {
      const headers = ['№', 'Табельный номер', 'Сотрудник', 'Продукт СИЗ', 'Дата выдачи', 'QR ссылка'];
      const body = filteredRows.map((row, index) => ([
        index + 1,
        row.tabelNumber || '-',
        row.fullName || '-',
        row.productsLabel || '-',
        row.issuedAt || '-',
        row.qrScanUrl || '-',
      ]));

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 30 },
        { wch: 48 },
        { wch: 20 },
        { wch: 36 },
      ];

      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let col = range.s.c; col <= range.e.c; col += 1) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const existingCell = worksheet[cellAddress] as any;
          if (!existingCell) continue;

          const isHeader = row === 0;
          existingCell.s = {
            font: {
              bold: isHeader,
              color: { rgb: isHeader ? 'FFFFFF' : '1E293B' },
            },
            fill: {
              fgColor: { rgb: isHeader ? '217346' : row % 2 === 0 ? 'FFFFFF' : 'F8FAFC' },
            },
            alignment: {
              vertical: 'center',
              horizontal: col === 0 ? 'center' : 'left',
              wrapText: true,
            },
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
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily PPE Issued');

      const today = formatDateInput(new Date());
      const fromPart = fromDate ? formatDateInput(fromDate) : 'all';
      const toPart = toDate ? formatDateInput(toDate) : 'all';
      const productPart = productFilter ? productFilter.replace(/[^a-zA-Z0-9а-яА-Я-_]+/g, '_').slice(0, 40) : 'all';
      XLSX.writeFile(workbook, `daily_ppe_issued_${productPart}_${fromPart}_${toPart}_${today}.xlsx`);
      toast.success(`Экспортировано ${filteredRows.length} записей`);
    } catch (error) {
      console.error('Ошибка экспорта daily PPE issued Excel:', error);
      toast.error('Не удалось скачать Excel');
    } finally {
      setIsExporting(false);
    }
  };

  if (!canSeeDailyPpeIssued) {
    return (
      <>
        <Breadcrumb pageName="Ежедневная выдача СИЗ" />
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="text-base text-red-600">Нет доступа к странице</div>
          <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            Только администратор, кладовщик и складской рабочий могут просматривать ежедневный отчет по выдаче СИЗ.
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
      <Breadcrumb pageName="Ежедневная выдача СИЗ" />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-black dark:text-white">Общий ежедневный журнал выдачи</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {reportSummary}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {canExportExcel && (
              <button
                type="button"
                onClick={exportFilteredRowsToExcel}
                disabled={filteredRows.length === 0 || isExporting}
                title="Скачать Excel"
                aria-label="Скачать Excel"
                className={`flex h-10 w-12 items-center justify-center rounded-md transition-colors duration-200 ${
                  isExporting
                    ? 'cursor-not-allowed bg-gray-400'
                    : 'bg-green-600 hover:bg-green-700'
                } text-white disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="2" width="20" height="20" rx="4" fill="#217346" />
                  <path
                    d="M9 6.5C8.44772 6.5 8 6.94772 8 7.5V16.5C8 17.0523 8.44772 17.5 9 17.5H15C15.5523 17.5 16 17.0523 16 16.5V10L12.5 6.5H9Z"
                    fill="white"
                  />
                  <path d="M12.5 6.5L16 10H13.25C12.6977 10 12.25 9.55228 12.25 9V6.5H12.5Z" fill="#e6f2e8" />
                  <path
                    d="M10.4 14.2L11.6 13L10.4 11.8C10.1828 11.5828 10.1828 11.2314 10.4 11.0142C10.6172 10.797 10.9686 10.797 11.1858 11.0142L12.4 12.2284L13.6142 11.0142C13.8314 10.797 14.1828 10.797 14.4 11.0142C14.6172 11.2314 14.6172 11.5828 14.4 11.8L13.2 13L14.4 14.2C14.6172 14.4172 14.6172 14.7686 14.4 14.9858C14.1828 15.203 13.8314 15.203 13.6142 14.9858L12.4 13.7716L11.1858 14.9858C10.9686 15.203 10.6172 15.203 10.4 14.9858C10.1828 14.7686 10.1828 14.4172 10.4 14.2Z"
                    fill="#217346"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded border border-stroke px-4 py-2 text-sm font-medium transition-colors ${
                showFilters
                  ? 'bg-primary text-white hover:bg-primary/90 dark:bg-primary dark:text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50 dark:border-strokedark dark:bg-boxdark dark:text-slate-300'
              }`}
            >
              <FiFilter size={16} />
              Фильтр
            </button>
            <button
              onClick={() => navigate('/nastroyka')}
              className="rounded border border-stroke px-4 py-2 hover:bg-gray-100 dark:border-strokedark dark:hover:bg-gray-700"
            >
              ← Назад
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-col gap-3 rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="md:w-64">
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Средство защиты</label>
                <select
                  value={productFilter}
                  onChange={(event) => setProductFilter(event.target.value)}
                  className="h-[42px] w-full rounded border border-stroke bg-white px-3 text-base text-slate-700 outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark-2 dark:text-slate-200"
                >
                  <option value="">Все средства защиты</option>
                  {productOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="md:w-48">
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">С даты</label>
                <DatePicker
                  selected={fromDate}
                  onChange={(date: Date | null) => setFromDate(date)}
                  dateFormat="dd.MM.yyyy"
                  placeholderText="dd.mm.yyyy"
                  customInput={<DateInput placeholder="dd.mm.yyyy" />}
                  isClearable
                  wrapperClassName="statistics-date-filter"
                />
              </div>
              <div className="md:w-48">
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">По дату</label>
                <DatePicker
                  selected={toDate}
                  onChange={(date: Date | null) => setToDate(date)}
                  dateFormat="dd.MM.yyyy"
                  placeholderText="dd.mm.yyyy"
                  customInput={<DateInput placeholder="dd.mm.yyyy" />}
                  isClearable
                  wrapperClassName="statistics-date-filter"
                />
              </div>
              {(productFilter || fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setProductFilter('');
                    setFromDate(null);
                    setToDate(null);
                  }}
                  className="h-[42px] rounded border border-stroke bg-white px-6 text-base text-slate-700 hover:bg-slate-50 dark:border-strokedark dark:bg-boxdark dark:text-slate-300"
                >
                  Сбросить
                </button>
              )}
            </div>
          </div>
        )}

        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          {loading ? (
            <div className="p-5 text-sm">Загрузка...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-5 text-sm text-slate-500 dark:text-slate-300">
              {(productFilter || fromDate || toDate)
                ? 'По выбранным фильтрам подтвержденных выдач не найдено.'
                : 'Подтвержденных выдач не найдено.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">№</th>
                    <th className="px-4 py-3 text-left font-semibold">Табельный номер</th>
                    <th className="px-4 py-3 text-left font-semibold">Сотрудник</th>
                    <th className="px-4 py-3 text-left font-semibold">Продукт СИЗ</th>
                    <th className="px-4 py-3 text-left font-semibold">Дата выдачи</th>
                    <th className="px-4 py-3 text-left font-semibold">QR код</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={row.key} className="border-t border-stroke align-top dark:border-strokedark">
                      <td className="px-4 py-4 font-medium text-black dark:text-white">{index + 1}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-200">{row.tabelNumber}</td>
                      <td className="px-4 py-4 text-black dark:text-white">
                        {row.employeeSlug ? (
                          <Link
                            to={`/item-view/${row.employeeSlug}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.fullName}
                          </Link>
                        ) : (
                          <span className="font-medium">{row.fullName}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-200">{row.productsLabel}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-200 whitespace-nowrap">{row.issuedAt}</td>
                      <td className="px-4 py-4">
                        {row.qrCodeImage ? (
                          <div className="space-y-2">
                            <a href={row.qrCodeImage} target="_blank" rel="noreferrer" className="block w-fit">
                              <img
                                src={row.qrCodeImage}
                                alt={`QR ${row.tabelNumber}`}
                                className="h-20 w-20 rounded border border-stroke object-contain p-1 dark:border-strokedark"
                              />
                            </a>
                            {row.qrScanUrl && (
                              <a
                                href={row.qrScanUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Открыть
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DailyPPEIssuedPage;