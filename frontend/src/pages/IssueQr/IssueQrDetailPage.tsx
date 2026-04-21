import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { BASE_URL, resolveEmployeeImageUrl } from '../../utils/urls';

type EmployeeInfo = {
  id?: number;
  slug?: string;
  full_name?: string;
  tabel_number?: string;
  position?: string;
  department_name?: string;
  section_name?: string;
  base_image?: string | null;
  base_image_data?: string | null;
};

type ProductInfo = {
  id: number;
  name: string;
  type_product?: string | null;
  type_product_display?: string | null;
  renewal_months?: number;
  size?: string | null;
};

type UserInfo = {
  id?: number | null;
  username?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  base_avatar?: string | null;
};

type IssueQrResponse = {
  qr_token: string;
  qr_scan_url?: string;
  qr_code_image?: string | null;
  employee: EmployeeInfo;
  issue: {
    item_id?: number;
    item_slug?: string;
    issued_at?: string | null;
    confirmed_at?: string | null;
    employee_signed_at?: string | null;
    warehouse_signed_at?: string | null;
    created_at?: string | null;
    issued_by_info?: UserInfo | null;
    created_by_info?: UserInfo | null;
    signature_image?: string | null;
    warehouse_signature_image?: string | null;
    verified_image?: string | null;
  };
  products: ProductInfo[];
};

const getIssuerDisplayName = (issuer?: UserInfo | null) => {
  if (!issuer) return '-';
  const fullName = [issuer.last_name, issuer.first_name].filter(Boolean).join(' ').trim();
  return fullName || issuer.full_name || issuer.username || '-';
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function IssueQrDetailPage() {
  const { token } = useParams();
  const [data, setData] = useState<IssueQrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('QR токен не найден.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await axios.get<IssueQrResponse>(`${BASE_URL}/issue-qr/${token}/`);
        if (!cancelled) {
          setData(response.data);
        }
      } catch (requestError: any) {
        if (!cancelled) {
          setError(requestError?.response?.data?.error || 'Не удалось загрузить данные выдачи.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-700">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
          Загрузка данных выдачи...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-700">
        <div className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-red-600">QR выдача не найдена</div>
          <div className="mt-2 text-sm text-slate-600">{error || 'Данные отсутствуют.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#eef4fb_45%,#dbe5f1_100%)] px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
        <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-7">
          <div className="flex flex-col gap-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">QR выдача СИЗ</div>
              <h1 className="mt-2 text-xl font-bold leading-tight sm:text-3xl">{data.employee.full_name || 'Сотрудник'}</h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Таб. №</div>
                <div className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{data.employee.tabel_number || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Должность</div>
                <div className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{data.employee.position || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Цех</div>
                <div className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{data.employee.department_name || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Отдел</div>
                <div className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{data.employee.section_name || '-'}</div>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 lg:grid-cols-[minmax(0,1fr)_132px] lg:items-center">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Кто выдал</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{getIssuerDisplayName(data.issue.issued_by_info)}</div>
                </div>
                <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 sm:text-right">
                  <div>
                    Создано: <span className="font-medium text-slate-900">{formatDateTime(data.issue.created_at)}</span>
                  </div>
                  <div>
                    Выдано: <span className="font-medium text-slate-900">{formatDateTime(data.issue.issued_at)}</span>
                  </div>
                </div>
              </div>

              <div className="mx-auto flex w-full max-w-[132px] justify-center lg:justify-end">
                <div className="w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  {data.employee.base_image_data || data.employee.base_image ? (
                    <img
                      src={resolveEmployeeImageUrl(data.employee.base_image_data || data.employee.base_image || '')}
                      alt="employee_base_photo"
                      className="h-28 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                      Нет фото
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4">
            <div className="rounded-[28px] bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Полученные средства защиты</h2>
                {data.issue.item_slug ? (
                  <Link
                    to={`/item-view/${data.issue.item_slug}`}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Открыть карточку
                  </Link>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[640px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3">№</th>
                      <th className="px-4 py-3">Наименование</th>
                      <th className="px-4 py-3">Размер</th>
                      <th className="px-4 py-3">Ед. изм.</th>
                      <th className="px-4 py-3">Срок</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((product, index) => (
                      <tr key={`${product.id}-${index}`} className="border-t border-slate-200">
                        <td className="px-4 py-3">{index + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                        <td className="px-4 py-3">{product.size || '-'}</td>
                        <td className="px-4 py-3">{product.type_product_display || product.type_product || '-'}</td>
                        <td className="px-4 py-3">{product.renewal_months ?? '-'} мес.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Фото подтверждения</h2>
                <div className="text-xs text-slate-500">Проверочное фото при выдаче</div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {data.issue.verified_image ? (
                  <img
                    src={resolveEmployeeImageUrl(data.issue.verified_image)}
                    alt="issue_verified_image"
                    className="h-64 w-full bg-white object-contain sm:h-80 xl:h-[420px]"
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-slate-400 sm:h-80 xl:h-[420px]">Фото отсутствует</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
              <h2 className="text-lg font-semibold">Информация о выдаче</h2>
              <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  Создано: <span className="font-medium text-slate-900">{formatDateTime(data.issue.created_at)}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  Выдано: <span className="font-medium text-slate-900">{formatDateTime(data.issue.issued_at)}</span>
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)] p-4 sm:p-5">
                <div className="text-sm font-semibold text-slate-900">Кто выдал</div>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {data.issue.issued_by_info?.base_avatar ? (
                        <img
                          src={resolveEmployeeImageUrl(data.issue.issued_by_info.base_avatar)}
                          alt="issued_by_avatar"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">Нет фото</div>
                      )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-600">
                    <div className="text-base font-semibold text-slate-900">{getIssuerDisplayName(data.issue.issued_by_info)}</div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      <div>
                        Фамилия: <span className="font-medium text-slate-900">{data.issue.issued_by_info?.last_name || '-'}</span>
                      </div>
                      <div>
                        Имя: <span className="font-medium text-slate-900">{data.issue.issued_by_info?.first_name || '-'}</span>
                      </div>
                      <div>
                        Должность: <span className="font-medium text-slate-900">{data.issue.issued_by_info?.position || '-'}</span>
                      </div>
                      
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}