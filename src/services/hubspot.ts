/**
 * HubSpot CRM sync service
 * Syncs customers and creates collection tasks
 */

const BASE = 'https://api.hubapi.com'

async function hubspotFetch(path: string, options?: RequestInit) {
  const token = import.meta.env.VITE_HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN not configured')
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`HubSpot ${res.status}: ${JSON.stringify(err)}`)
  }
  return res.json()
}

export interface HubSpotContact {
  id: string
  properties: {
    firstname?: string
    lastname?: string
    email?: string
    company?: string
    phone?: string
  }
}

/** Search for a contact by email */
export async function searchContactByEmail(email: string): Promise<HubSpotContact | null> {
  const data = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['firstname', 'lastname', 'email', 'company', 'phone'],
    }),
  })
  return data.results?.[0] ?? null
}

/** Create or update a contact */
export async function upsertContact(params: {
  email: string
  firstName: string
  lastName: string
  company: string
  phone?: string
}): Promise<HubSpotContact> {
  const existing = await searchContactByEmail(params.email)
  if (existing) {
    return hubspotFetch(`/crm/v3/objects/contacts/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: {
        firstname: params.firstName, lastname: params.lastName,
        company: params.company, phone: params.phone,
      }}),
    })
  }
  return hubspotFetch('/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({ properties: {
      email: params.email, firstname: params.firstName,
      lastname: params.lastName, company: params.company, phone: params.phone,
    }}),
  })
}

/** Create a collection task in HubSpot */
export async function createCollectionTask(params: {
  contactId: string
  subject: string
  notes: string
  dueDate: string // ISO string
}): Promise<{ id: string }> {
  return hubspotFetch('/crm/v3/objects/tasks', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        hs_task_subject: params.subject,
        hs_task_body: params.notes,
        hs_timestamp: new Date(params.dueDate).getTime(),
        hs_task_status: 'NOT_STARTED',
        hs_task_type: 'CALL',
      },
      associations: [{
        to: { id: params.contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }],
      }],
    }),
  })
}
