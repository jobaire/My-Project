export const COMPANY_ROLES = [
  { value: 'admin',              label: 'Company Admin',       color: 'blue'    },
  { value: 'planner',            label: 'Planner',             color: 'purple'  },
  { value: 'production_manager', label: 'Production Manager',  color: 'orange'  },
  { value: 'data_entry',         label: 'Data Entry',          color: 'cyan'    },
  { value: 'viewer',             label: 'Viewer',              color: 'default' },
]

export const ROLE_MAP = Object.fromEntries(COMPANY_ROLES.map((r) => [r.value, r]))

export function roleLabel(value) {
  return ROLE_MAP[value]?.label ?? value ?? '—'
}

export function roleColor(value) {
  return ROLE_MAP[value]?.color ?? 'default'
}
