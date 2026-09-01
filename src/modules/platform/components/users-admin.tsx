'use client'

// P1.5-T13: فهرست کاربران — نمای کامل تب‌محور (جایگزین دیالوگ‌های ایجاد/ویرایش/بازنشانی/غیرفعال)
// هر ردیف با کلیک، تب رکورد کاربر را باز می‌کند (الگوی پوسته چندسندی)؛
// ماتریس عضویت چندشرکتی: هر کاربر = چند شرکت × نقش (ADMIN/MANAGER/OPERATOR/VIEWER)

import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { apiGet } from '@/core/shared/api-client'
import type { UserItem } from '@/types/platform'
import { ROLE_LABELS, PageHeader } from '@/components/common/ui-bits'
import { DataGrid, type DataGridColumn } from '@/components/common/data-grid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ShieldAlert, UserPlus } from 'lucide-react'
import { faDigits } from '@/core/shared/jalali'

export function UsersView() {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const canManage = !!me?.user.isAdmin || activeCompany?.role === 'ADMIN'

  const openRecord = useWorkspace((s) => s.openRecord)
  const openNew = useWorkspace((s) => s.openNew)
  const myUserId = me?.user.id

  const [users, setUsers] = useState<UserItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<{ users: UserItem[] }>('/api/users')
      .then((d) => setUsers(d.users))
      .catch(() => { setUsers([]); setLoadError('بارگذاری فهرست کاربران ناموفق بود') })
  }, [])

  useEffect(() => { load() }, [load])

  // گارد دسترسی (کشف ممیزی موبایل P1-T32): غیرمدیر هرگز وارد جدول نمی‌شود —
  // پاسخ /api/users برای غیرمدیر «دایرکتوری حداقلی» است (بدون companies/username/isActive)
  // و رندر ستون عضویت‌ها روی undefined کرش می‌کرد (آینه الگوی گارد تنظیمات P1-T14)
  if (me && !canManage) {
    return (
      <div className="space-y-5">
        <PageHeader title="کاربران" description="مدیریت کاربران، نقش‌ها و ماتریس عضویت چندشرکتی" />
        <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 p-6 text-sm leading-7">
            <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold">مدیریت کاربران فقط برای مدیر پلتفرم یا مدیر شرکت فعال مجاز است.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                مدیران می‌توانند کاربر بسازند، نقش per-company تعیین کنند و گذرواژه بازنشانی کنند.
                اگر مسئولیتی مدیریتی دارید، از مدیر سامانه درخواست ارتقای نقش کنید (ماتریس دسترسی در سند امنیت ‎§۳).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ستون‌ها بدون useMemo — کامپایلر React خودش ممویز می‌کند (وابستگی me?.user با دستی ناسازگار می‌شد)
  const columns: DataGridColumn<UserItem>[] = [
    {
      key: 'user', header: 'کاربر', enableHiding: false,
      cell: (u) => (
        <div>
          <p className="font-medium">
            {u.fullName}
            {u.id === me?.user.id ? <span className="ms-1 text-[10px] text-muted-foreground">(شما)</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{u.jobTitle ?? '—'}</p>
        </div>
      ),
      sortValue: (u) => u.fullName,
    },
    {
      key: 'username', header: 'نام کاربری',
      cell: (u) => (
        <div>
          <p className="font-mono text-xs" dir="ltr">{u.username}</p>
          {u.isAdmin ? <Badge className="mt-1 border-0 bg-primary/10 text-primary">مدیر پلتفرم</Badge> : null}
        </div>
      ),
      sortValue: (u) => u.username,
    },
    {
      key: 'memberships', header: 'عضویت‌ها',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.companies.map((c) => (
            <Badge key={c.code} variant="secondary" className="border-0 text-[10px]">
              {c.name} · {ROLE_LABELS[c.role] ?? c.role}
            </Badge>
          ))}
        </div>
      ),
      sortValue: (u) => String(u.companies.length),
    },
    {
      key: 'isActive', header: 'وضعیت',
      cell: (u) => u.isActive
        ? <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700">فعال</Badge>
        : <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">غیرفعال</Badge>,
      sortValue: (u) => (u.isActive ? 1 : 0),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="کاربران"
        description={`${users ? faDigits(users.length) : '…'} کاربر در دامنه دید شما — نقش‌ها per-company تعیین می‌شوند؛ یک کاربر می‌تواند در چند شرکت نقش متفاوت داشته باشد`}
        actions={canManage ? (
          <Button size="sm" className="gap-1.5" onClick={() => openNew('users')}>
            <UserPlus className="h-4 w-4" /> کاربر جدید
          </Button>
        ) : undefined}
      />

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      <DataGrid
        columns={columns}
        rows={users ?? []}
        loading={users === null}
        persistKey="users"
        emptyText="کاربری در دامنه دید شما یافت نشد"
        emptyHint="کاربران هر شرکت فقط برای مدیران همان شرکت قابل مدیریت است؛ برای افزودن، «کاربر جدید» را بزنید."
        searchKeys={(u) => [u.fullName, u.username, u.jobTitle ?? '', ...u.companies.flatMap((c) => [c.name, c.code])]}
        initialSort={[{ id: 'user', desc: false }]}
        onRowClick={(u) => openRecord('users', u.id, u.fullName)}
      />

      <p className="text-xs leading-6 text-muted-foreground">
        با کلیک روی هر ردیف، پرونده کاربر در تب جداگانه باز می‌شود: ویرایش مشخصات، ماتریس عضویت شرکتی،
        بازنشانی گذرواژه و فعال/غیرفعال‌سازی — همه در صفحه کامل، بدون پاپ‌آپ.
      </p>
    </div>
  )
}
