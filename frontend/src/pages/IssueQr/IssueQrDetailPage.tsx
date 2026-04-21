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
      <div className="min-h-screen bg-[#f2efe7] px-4 py-8 text-slate-700">
        <div className="mx-auto max-w-4xl border border-slate-300 bg-white p-6 shadow-[8px_8px_0_rgba(15,23,42,0.08)]">
          Загрузка данных выдачи...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f2efe7] px-4 py-8 text-slate-700">
        <div className="mx-auto max-w-4xl border border-red-300 bg-white p-6 shadow-[8px_8px_0_rgba(127,29,29,0.08)]">
          <div className="text-lg font-semibold text-red-600">QR выдача не найдена</div>
          <div className="mt-2 text-sm text-slate-600">{error || 'Данные отсутствуют.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2efe7] bg-[linear-gradient(135deg,rgba(255,255,255,0.65)_0%,rgba(242,239,231,1)_45%,rgba(228,222,207,1)_100%)] px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <div className="border border-slate-300 bg-[#fffdf7] shadow-[10px_10px_0_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_220px]">
            <div className="border-b border-slate-300 p-5 sm:p-7 lg:border-b-0 lg:border-r">
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#8b6f47]">QR выдача СИЗ</div>
              <h1 className="mt-3 max-w-4xl text-2xl font-black uppercase leading-tight tracking-tight sm:text-[34px]">
                {data.employee.full_name || 'Сотрудник'}
              </h1>

              <div className="mt-6 grid gap-0 border border-slate-300 sm:grid-cols-2 xl:grid-cols-4">
                <div className="border-b border-slate-300 bg-white p-4 xl:border-b-0 xl:border-r sm:border-r">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Таб. №</div>
                  <div className="mt-2 text-base font-bold text-slate-900">{data.employee.tabel_number || '-'}</div>
                </div>
                <div className="border-b border-slate-300 bg-[#f8f4ea] p-4 xl:border-b-0 xl:border-r">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Должность</div>
                  <div className="mt-2 break-words text-sm font-semibold leading-5 text-slate-900">{data.employee.position || '-'}</div>
                </div>
                <div className="border-b border-slate-300 bg-white p-4 sm:border-r xl:border-b-0 xl:border-r">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Цех</div>
                  <div className="mt-2 break-words text-sm font-semibold leading-5 text-slate-900">{data.employee.department_name || '-'}</div>
                </div>
                <div className="bg-[#f8f4ea] p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Отдел</div>
                  <div className="mt-2 break-words text-sm font-semibold leading-5 text-slate-900">{data.employee.section_name || '-'}</div>
                </div>
              </div>

              <div className="mt-5 grid gap-0 border border-slate-300 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                <div className="border-b border-slate-300 bg-white p-4 lg:border-b-0 lg:border-r">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Кто выдал</div>
                  <div className="mt-2 break-words text-base font-bold text-slate-900">{getIssuerDisplayName(data.issue.issued_by_info)}</div>
                  <div className="mt-1 break-words text-xs uppercase tracking-wide text-[#8b6f47]">{data.issue.issued_by_info?.position || 'Должность не указана'}</div>
                </div>
                <div className="border-b border-slate-300 bg-[#f8f4ea] p-4 lg:border-b-0 lg:border-r">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Создано</div>
                  <div className="mt-2 text-sm font-semibold leading-5 text-slate-900">{formatDateTime(data.issue.created_at)}</div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Выдано</div>
                  <div className="mt-2 text-sm font-semibold leading-5 text-slate-900">{formatDateTime(data.issue.issued_at)}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center bg-[#1f2937] p-5 sm:p-7">
              <div className="w-full max-w-[170px]">
                <div className="border border-white/20 bg-white p-2 shadow-[6px_6px_0_rgba(0,0,0,0.18)]">
                  {data.employee.base_image_data || data.employee.base_image ? (
                    <img
                      src={resolveEmployeeImageUrl(data.employee.base_image_data || data.employee.base_image || '')}
                      alt="employee_base_photo"
                      className="h-44 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-44 w-full items-center justify-center bg-slate-100 text-xs uppercase tracking-[0.18em] text-slate-400">
                      Нет фото
                    </div>
                  )}
                </div>
                <div className="mt-3 border-l-4 border-[#c49b5a] pl-3 text-xs uppercase tracking-[0.16em] text-white/80">
                  Employee photo
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.8fr)]">
          <div className="space-y-4">
            <section className="border border-slate-300 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-3 border-b border-slate-300 bg-[#f8f4ea] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold uppercase tracking-[0.08em] text-slate-900">Полученные средства защиты</h2>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">Issued PPE items</div>
                </div>
                {data.issue.item_slug ? (
                  <Link
                    to={`/item-view/${data.issue.item_slug}`}
                    className="inline-flex items-center justify-center border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#8b6f47] hover:border-[#8b6f47]"
                  >
                    Открыть карточку
                  </Link>
                ) : null}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-slate-300 bg-white text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-4 py-4">№</th>
                      <th className="px-4 py-4">Наименование</th>
                      <th className="px-4 py-4">Размер</th>
                      <th className="px-4 py-4">Ед. изм.</th>
                      <th className="px-4 py-4">Срок</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((product, index) => (
                      <tr key={`${product.id}-${index}`} className="border-b border-slate-200 last:border-b-0 odd:bg-[#fffdf7] even:bg-[#f8f4ea]/50">
                        <td className="px-4 py-4 font-semibold text-slate-700">{index + 1}</td>
                        <td className="px-4 py-4 font-semibold text-slate-900">{product.name}</td>
                        <td className="px-4 py-4 text-slate-700">{product.size || '-'}</td>
                        <td className="px-4 py-4 text-slate-700">{product.type_product_display || product.type_product || '-'}</td>
                        <td className="px-4 py-4 text-slate-700">{product.renewal_months ?? '-'} мес.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="border border-slate-300 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-1 border-b border-slate-300 bg-[#1f2937] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-bold uppercase tracking-[0.08em] text-white">Фото подтверждения</h2>
                <div className="text-xs uppercase tracking-[0.18em] text-white/70">Проверочное фото при выдаче</div>
              </div>
              <div className="bg-[#e8e0d0] p-3 sm:p-4">
                <div className="border border-slate-300 bg-white">
                  {data.issue.verified_image ? (
                    <img
                      src={resolveEmployeeImageUrl(data.issue.verified_image)}
                      alt="issue_verified_image"
                      className="h-64 w-full bg-white object-contain sm:h-80 xl:h-[440px]"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center bg-white text-sm uppercase tracking-[0.18em] text-slate-400 sm:h-80 xl:h-[440px]">
                      Фото отсутствует
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="border border-slate-300 bg-[#fffdf7] shadow-[8px_8px_0_rgba(15,23,42,0.06)]">
              <div className="border-b border-slate-300 bg-[#8b6f47] px-5 py-4 text-white">
                <h2 className="text-lg font-bold uppercase tracking-[0.08em]">Информация о выдаче</h2>
              </div>

              <div className="space-y-4 p-4 sm:p-5">
                <div className="grid gap-3">
                  <div className="border border-slate-300 bg-white px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Создано</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(data.issue.created_at)}</div>
                  </div>
                  <div className="border border-slate-300 bg-[#f8f4ea] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Выдано</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(data.issue.issued_at)}</div>
                  </div>
                </div>

                <div className="border border-slate-300 bg-white">
                  <div className="border-b border-slate-300 bg-slate-900 px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white">
                    Кто выдал
                  </div>
                  <div className="space-y-4 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="mx-auto h-24 w-24 shrink-0 border border-slate-300 bg-[#f8f4ea] sm:mx-0">
                        {data.issue.issued_by_info?.base_avatar ? (
                          <img
                            src={resolveEmployeeImageUrl(data.issue.issued_by_info.base_avatar)}
                            alt="issued_by_avatar"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-slate-400">Нет фото</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-lg font-bold leading-tight text-slate-900">{getIssuerDisplayName(data.issue.issued_by_info)}</div>
                        <div className="mt-1 break-words text-xs uppercase tracking-[0.18em] text-[#8b6f47]">{data.issue.issued_by_info?.position || '-'}</div>
                      </div>
                    </div>

                    <div className="grid gap-0 border border-slate-300">
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] border-b border-slate-300 bg-[#fffdf7] text-sm">
                        <div className="border-r border-slate-300 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Фамилия</div>
                        <div className="break-words px-3 py-3 font-medium text-slate-900">{data.issue.issued_by_info?.last_name || '-'}</div>
                      </div>
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] border-b border-slate-300 bg-white text-sm">
                        <div className="border-r border-slate-300 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Имя</div>
                        <div className="break-words px-3 py-3 font-medium text-slate-900">{data.issue.issued_by_info?.first_name || '-'}</div>
                      </div>
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] bg-[#fffdf7] text-sm">
                        <div className="border-r border-slate-300 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Должность</div>
                        <div className="break-words px-3 py-3 font-medium text-slate-900">{data.issue.issued_by_info?.position || '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}