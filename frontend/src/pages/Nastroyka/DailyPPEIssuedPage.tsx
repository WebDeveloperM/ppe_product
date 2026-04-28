import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import axioss from '../../api/axios';
import { resolveEmployeeImageUrl } from '../../utils/urls';
import { normalizeRole } from '../../utils/pageAccess';

type EmployeeInfo = {
  id?: number | string;
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
  tabelNumber: string;
  fullName: string;
  position: string;
  departmentSection: string;
  issuedAtRaw: string;
  issuedAt: string;
  productsLabel: string;
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

const buildDepartmentSection = (employee?: EmployeeInfo) => {
  const department = String(employee?.department?.name || '').trim();
  const section = String(employee?.section?.name || '').trim();
  if (department && section) return `${department} / ${section}`;
  return department || section || '—';
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

const DailyPPEIssuedPage = () => {
  const navigate = useNavigate();
  const role = useMemo(() => normalizeRole(localStorage.getItem('role')), []);
  const isAdmin = role === 'admin';

  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DailyIssueRow[]>([]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadReport = async () => {
      setLoading(true);
      try {
        const response = await axioss.get('/daily-issued-items/', {
          params: {
            issued_at: selectedDate,
          },
        });

        const payload: DailyIssuedApiRow[] = Array.isArray(response.data) ? response.data : [];
        const nextRows = payload
          .map((item) => {
            const employee = item?.employee;
            return {
              key: `${employee?.id || item.id}-${item.id}`,
              tabelNumber: String(employee?.tabel_number || '').trim() || '—',
              fullName: buildFullName(employee),
              position: String(employee?.position || '').trim() || '—',
              departmentSection: buildDepartmentSection(employee),
              issuedAtRaw: String(item?.issued_at || ''),
              issuedAt: formatIssuedAt(item?.issued_at),
              productsLabel: buildProductsLabel(item?.ppeproduct_info),
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
  }, [isAdmin, selectedDate]);

  if (!isAdmin) {
    return (
      <>
        <Breadcrumb pageName="Ежедневная выдача СИЗ" />
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="text-base text-red-600">Нет доступа к странице</div>
          <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            Только администратор может просматривать ежедневный отчет по выдаче СИЗ.
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
              Отчет за {formatReportDate(selectedDate)}. Всего получателей: {rows.length}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex flex-col text-sm text-slate-700 dark:text-slate-200">
              <span className="mb-1 font-medium">Дата выдачи</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="rounded border border-stroke px-3 py-2 outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark-2"
              />
            </label>

            <button
              onClick={() => navigate('/nastroyka')}
              className="rounded border border-stroke px-4 py-2 hover:bg-gray-100 dark:border-strokedark dark:hover:bg-gray-700"
            >
              ← Назад
            </button>
          </div>
        </div>

        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          {loading ? (
            <div className="p-5 text-sm">Загрузка...</div>
          ) : rows.length === 0 ? (
            <div className="p-5 text-sm text-slate-500 dark:text-slate-300">
              На выбранную дату подтвержденных выдач не найдено.
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
                    <th className="px-4 py-3 text-left font-semibold">Подтверждающая подпись</th>
                    <th className="px-4 py-3 text-left font-semibold">QR код</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.key} className="border-t border-stroke align-top dark:border-strokedark">
                      <td className="px-4 py-4 font-medium text-black dark:text-white">{index + 1}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-200">
                        <div>{row.tabelNumber}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.issuedAt}</div>
                      </td>
                      <td className="px-4 py-4 text-black dark:text-white">
                        <div className="font-medium">{row.fullName}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.position}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.departmentSection}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-200">{row.productsLabel}</td>
                      <td className="px-4 py-4">
                        {row.signatureImage ? (
                          <a href={row.signatureImage} target="_blank" rel="noreferrer" className="block w-fit">
                            <img
                              src={row.signatureImage}
                              alt={row.fullName}
                              className="h-20 w-28 rounded border border-stroke object-cover dark:border-strokedark"
                            />
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
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
                                QR havolasi
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