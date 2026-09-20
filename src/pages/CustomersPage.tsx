import { useCustomers } from '../hooks/useCustomers'
import { formatAED } from '../lib/skills'

export default function CustomersPage() {
  const { data: customers, isLoading } = useCustomers()

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-slate-500">
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Code</th>
              <th className="text-right px-4 py-3 font-medium">Credit Limit</th>
              <th className="text-left px-4 py-3 font-medium">Country</th>
              <th className="text-right px-4 py-3 font-medium">Risk Score</th>
              <th className="text-left px-4 py-3 font-medium">HubSpot</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {customers?.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-3 font-mono text-slate-500">{c.code}</td>
                <td className="px-4 py-3 text-right tabular">{formatAED(c.credit_limit)}</td>
                <td className="px-4 py-3 text-slate-600">{c.country}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.risk_score >= 70 ? 'bg-red-50 text-f9-red' :
                    c.risk_score >= 40 ? 'bg-amber-50 text-f9-amber' :
                    'bg-green-50 text-f9-teal'
                  }`}>{c.risk_score}</span>
                </td>
                <td className="px-4 py-3">
                  {c.hubspot_id
                    ? <a href={`https://app.hubspot.com/contacts/0/contact/${c.hubspot_id}`} target="_blank" rel="noreferrer" className="text-f9-blue hover:underline text-xs">View CRM</a>
                    : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
