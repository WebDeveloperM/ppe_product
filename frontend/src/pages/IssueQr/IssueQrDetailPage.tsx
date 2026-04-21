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
};

type TimelineItem = {
  key: string;
  label: string;
  timestamp?: string | null;
  actor?: UserInfo | null;
  description?: string;
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
  timeline: TimelineItem[];
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-3xl bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">QR выдача СИЗ</div>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{data.employee.full_name || 'Сотрудник'}</h1>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <div>Таб. №: <span className="font-medium text-slate-900">{data.employee.tabel_number || '-'}</span></div>
                <div>Должность: <span className="font-medium text-slate-900">{data.employee.position || '-'}</span></div>
                <div>Цех: <span className="font-medium text-slate-900">{data.employee.department_name || '-'}</span></div>
                <div>Отдел: <span className="font-medium text-slate-900">{data.employee.section_name || '-'}</span></div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              {data.qr_code_image ? (
                <img
                  src={resolveEmployeeImageUrl(data.qr_code_image)}
                  alt="qr_code"
                  className="mx-auto h-32 w-32 rounded-lg border border-slate-200 bg-white object-contain"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                  QR
                </div>
              )}
              <div className="mt-3 text-xs text-slate-500">Код выдачи: {data.qr_token}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
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

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
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

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
              <h2 className="text-lg font-semibold">Информация о выдаче</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div>Создано: <span className="font-medium text-slate-900">{formatDateTime(data.issue.created_at)}</span></div>
                <div>Выдано: <span className="font-medium text-slate-900">{formatDateTime(data.issue.issued_at)}</span></div>
                <div>Подпись сотрудника: <span className="font-medium text-slate-900">{formatDateTime(data.issue.employee_signed_at)}</span></div>
                <div>Подпись кладовщика: <span className="font-medium text-slate-900">{formatDateTime(data.issue.warehouse_signed_at)}</span></div>
                <div>Кто выдал: <span className="font-medium text-slate-900">{data.issue.issued_by_info?.full_name || data.issue.issued_by_info?.username || '-'}</span></div>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
              <h2 className="text-lg font-semibold">Цепочка оформления</h2>
              <div className="mt-4 space-y-4">
                {data.timeline.map((entry, index) => (
                  <div key={entry.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                        {index + 1}
                      </div>
                      {index < data.timeline.length - 1 ? <div className="mt-2 h-full w-px bg-slate-200" /> : null}
                    </div>
                    <div className="pb-2">
                      <div className="font-medium text-slate-900">{entry.label}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{formatDateTime(entry.timestamp)}</div>
                      <div className="mt-2 text-sm text-slate-600">{entry.description || '-'}</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{entry.actor?.full_name || entry.actor?.username || '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}