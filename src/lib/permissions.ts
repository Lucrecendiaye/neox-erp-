export const MODULES = [
  'pos',
  'products',
  'depots',
  'customers',
  'deliveries',
  'suppliers',
  'sales',
  'purchases',
  'payments',
  'reports',
  'cash',
  'users',
  'settings',
  'trash',
  'invoices',
  'cashbook',
  'sms',
  'audit',
  'notifications',
] as const

export type Module = typeof MODULES[number]

export const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'adjust_stock',
  'transfer',
  'validate',
  'cancel_sale',
  'export',
  'print',
] as const

export type Action = typeof ACTIONS[number]

export type Permission = `${Module}:${Action}` | '*'

export const ALL_PERMISSION: Permission = '*'

export const MODULE_LABELS: Record<Module, string> = {
  pos: 'Caisse POS',
  products: 'Produits',
  depots: 'Dépôts',
  customers: 'Clients',
  deliveries: 'Ventes à livraison',
  suppliers: 'Fournisseurs',
  sales: 'Ventes',
  purchases: 'Achats',
  payments: 'Paiements',
  reports: 'Rapports',
  cash: 'Cash',
  settings: 'Paramètres',
  users: 'Utilisateurs',
  trash: 'Corbeille',
  invoices: 'Factures',
  cashbook: 'Caisse',
  sms: 'Rappels SMS',
  audit: "Journal d'audit",
  notifications: 'Notifications',
}

export const ACTION_LABELS: Record<Action, string> = {
  view: 'Voir',
  create: 'Ajouter',
  edit: 'Modifier',
  delete: 'Supprimer',
  adjust_stock: 'Réajuster le stock',
  transfer: 'Effectuer un transfert',
  validate: 'Valider une opération',
  cancel_sale: 'Annuler une vente',
  export: 'Exporter',
  print: 'Imprimer',
}

export interface SimplifiedPermission {
  id: string
  label: string
  permissions: Permission[]
  description?: string
}

export const SIMPLIFIED_PERMISSIONS: SimplifiedPermission[] = [
  { id: 'pos', label: 'Caisse POS', permissions: ['pos:view', 'pos:create'] },
  { id: 'products_view', label: 'Voir les produits', permissions: ['products:view'] },
  { id: 'products_manage', label: 'Gérer les produits (ajouter, modifier)', permissions: ['products:create', 'products:edit'] },
  { id: 'products_delete', label: 'Supprimer des produits', permissions: ['products:delete'] },

  { id: 'customers', label: 'Gérer les clients', permissions: ['customers:view', 'customers:create', 'customers:edit', 'customers:delete'] },
  { id: 'deliveries_view', label: 'Voir les ventes à livraison', permissions: ['deliveries:view'] },
  { id: 'deliveries_courier', label: 'Livreur (traiter ses livraisons)', permissions: ['deliveries:view', 'deliveries:edit'] },
  { id: 'deliveries_manage', label: 'Gérer les ventes à livraison (créer, valider)', permissions: ['deliveries:create', 'deliveries:validate', 'deliveries:delete'] },
  { id: 'suppliers', label: 'Gérer les fournisseurs', permissions: ['suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete'] },
  { id: 'sales_view', label: 'Voir les ventes', permissions: ['sales:view'] },
  { id: 'sales_create', label: 'Effectuer des ventes', permissions: ['sales:create'] },
  { id: 'sales_cancel', label: 'Annuler des ventes', permissions: ['sales:cancel_sale'] },
  { id: 'sales_delete', label: 'Supprimer des ventes', permissions: ['sales:delete'] },
  { id: 'sales_edit', label: 'Modifier des ventes', permissions: ['sales:edit'] },
  { id: 'purchases', label: 'Gérer les achats', permissions: ['purchases:view', 'purchases:create', 'purchases:edit', 'purchases:delete'] },
  { id: 'payments', label: 'Gérer les paiements', permissions: ['payments:view', 'payments:create', 'payments:edit', 'payments:delete'] },
  { id: 'depots', label: 'Gérer les dépôts', permissions: ['depots:view', 'depots:create', 'depots:edit', 'depots:delete'] },
  { id: 'depots_view_stock', label: 'Voir le stock des dépôts (lecture seule)', permissions: ['depots:view'] },
  { id: 'depots_transfer', label: 'Effectuer des transferts entre dépôts', permissions: ['depots:transfer'] },
  { id: 'depots_adjust', label: 'Ajuster le stock des dépôts', permissions: ['depots:adjust_stock'] },
  { id: 'depots_validate', label: 'Valider les bons de sortie', permissions: ['depots:validate'] },
  { id: 'reports', label: 'Rapports', permissions: ['reports:view'] },
  { id: 'cash_view', label: 'Voir le cash (trésorerie externe)', permissions: ['cash:view'] },
  { id: 'cash_manage', label: 'Gérer le cash (entrées, sorties)', permissions: ['cash:create', 'cash:edit'] },
  { id: 'cash_delete', label: 'Supprimer / annuler des opérations cash', permissions: ['cash:delete'] },
  { id: 'cash_export', label: 'Exporter / imprimer les rapports cash', permissions: ['cash:export', 'cash:print'] },
  { id: 'users_view', label: 'Voir les utilisateurs', permissions: ['users:view'] },
  { id: 'users_manage', label: 'Modifier les utilisateurs', permissions: ['users:create', 'users:edit', 'users:delete'] },
  { id: 'settings', label: 'Paramètres', permissions: ['settings:view'] },
  { id: 'trash', label: 'Corbeille', permissions: ['trash:view'] },
  { id: 'invoices_view', label: 'Voir les factures', permissions: ['invoices:view'] },
  { id: 'invoices_manage', label: 'Gérer les factures (créer, modifier, supprimer)', permissions: ['invoices:create', 'invoices:edit', 'invoices:delete'] },
  { id: 'cashbook_view', label: 'Voir la caisse', permissions: ['cashbook:view'] },
  { id: 'cashbook_manage', label: 'Gérer la caisse (entrées, sorties)', permissions: ['cashbook:create', 'cashbook:edit', 'cashbook:delete'] },
  { id: 'sms', label: 'Envoyer des rappels', permissions: ['sms:view', 'sms:create'] },
  { id: 'audit', label: 'Voir le journal d\'audit', permissions: ['audit:view'] },
  { id: 'notifications', label: 'Voir les notifications', permissions: ['notifications:view'] },
]

export interface RolePreset {
  id: string
  label: string
  permissionIds: string[]
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'vendeur',
    label: 'Vendeur',
    permissionIds: ['pos', 'products_view', 'customers', 'sales_view', 'sales_create', 'sales_cancel'],
  },
  {
    id: 'livreur',
    label: 'Livreur',
    permissionIds: ['deliveries_view', 'deliveries_courier'],
  },
  {
    id: 'gestionnaire_stock',
    label: 'Gestionnaire de stock',
    permissionIds: ['products_view', 'products_manage', 'depots'],
  },
  {
    id: 'comptable',
    label: 'Comptable',
    permissionIds: ['sales_view', 'purchases', 'payments', 'reports', 'cash_view', 'cash_manage', 'cash_export'],
  },
  {
    id: 'superviseur',
    label: 'Superviseur',
    permissionIds: ['pos', 'products_view', 'products_manage', 'customers', 'suppliers', 'sales_view', 'sales_create', 'sales_cancel', 'purchases', 'payments', 'depots', 'reports', 'cash_view', 'cash_manage', 'cash_delete', 'cash_export', 'trash'],
  },
  {
    id: 'observateur',
    label: 'Observateur',
    permissionIds: ['products_view', 'customers', 'suppliers', 'sales_view', 'purchases', 'reports'],
  },
]

export function getPermissionsFromSimplified(selectedIds: string[]): string[] {
  const perms: string[] = []
  for (const id of selectedIds) {
    const entry = SIMPLIFIED_PERMISSIONS.find(p => p.id === id)
    if (entry) {
      for (const p of entry.permissions) {
        if (!perms.includes(p)) perms.push(p)
      }
    }
  }
  return perms
}

export function getSimplifiedFromPermissions(permissions: string[] | undefined | null): string[] {
  if (!permissions || permissions.includes('*')) return SIMPLIFIED_PERMISSIONS.map(p => p.id)
  const ids: string[] = []
  for (const entry of SIMPLIFIED_PERMISSIONS) {
    const hasAll = entry.permissions.every(p => permissions.includes(p))
    if (hasAll) ids.push(entry.id)
  }
  return ids
}

export function parsePermission(p: Permission): { module: Module; action: Action } | null {
  if (p === '*') return null
  const parts = p.split(':')
  if (parts.length !== 2) return null
  const [module, action] = parts as [Module, Action]
  if (!MODULES.includes(module)) return null
  if (!ACTIONS.includes(action)) return null
  return { module, action }
}

export function hasPermission(
  permissions: string[] | undefined | null,
  module: Module,
  action: Action
): boolean {
  if (!permissions) return false
  if (permissions.includes('*')) return true
  return permissions.includes(`${module}:${action}`)
}

export function hasAnyModulePermission(
  permissions: string[] | undefined | null,
  module: Module
): boolean {
  if (!permissions) return false
  if (permissions.includes('*')) return true
  return permissions.some(p => {
    const parsed = parsePermission(p as Permission)
    return parsed?.module === module
  })
}

export function getModulePermissions(
  permissions: string[] | undefined | null,
  module: Module
): Action[] {
  if (!permissions) return []
  if (permissions.includes('*')) return [...ACTIONS]
  return permissions
    .filter(p => {
      const parsed = parsePermission(p as Permission)
      return parsed?.module === module
    })
    .map(p => (parsePermission(p as Permission) as { module: Module; action: Action }).action)
}

export function isAdmin(permissions: string[] | undefined | null): boolean {
  return permissions?.includes('*') ?? false
}

export function getAllPermissionsForModule(module: Module): Permission[] {
  return ACTIONS.map(action => `${module}:${action}` as Permission)
}

export function getAllPermissions(): Permission[] {
  return MODULES.flatMap(m => ACTIONS.map(a => `${m}:${a}` as Permission))
}

export const DEFAULT_ADMIN_PERMISSIONS: Permission[] = ['*']

export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  'pos:view', 'pos:create',
  'products:view', 'products:create',
  'customers:view', 'customers:create',
  'suppliers:view',
  'sales:view', 'sales:create',
]

export const DEFAULT_VIEWER_PERMISSIONS: Permission[] = [
  'products:view',
  'customers:view',
  'suppliers:view',
  'sales:view',
  'purchases:view',
  'reports:view',
]
