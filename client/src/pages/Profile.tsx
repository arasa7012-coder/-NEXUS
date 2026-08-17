import { useState, type ReactNode } from 'react';
import { Calendar, Edit3, Info, Mail, Phone, Save, ShieldAlert, User, X } from 'lucide-react';
import { toast } from 'sonner';

type ProfileData = { firstName: string; lastName: string; email: string; phone: string; country: string; city: string; joinDate: string; bio: string; };

const initialProfile: ProfileData = {
  firstName: 'Preview',
  lastName: 'Account',
  email: 'Not connected',
  phone: 'Not connected',
  country: 'Not connected',
  city: 'Not connected',
  joinDate: 'Not connected',
  bio: 'Local profile-editing demonstration. Changes remain only in the current browser preview.',
};

export default function Profile() {
  const [profile, setProfile] = useState(initialProfile);
  const [draft, setDraft] = useState(initialProfile);
  const [editing, setEditing] = useState(false);
  const [preferences, setPreferences] = useState({ email: true, marketing: false, twoFactor: true });

  const updateDraft = (key: keyof ProfileData, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const beginEdit = () => { setDraft(profile); setEditing(true); };
  const cancelEdit = () => { setDraft(profile); setEditing(false); };
  const saveProfile = () => { setProfile(draft); setEditing(false); toast.info('Profile preview updated', { description: 'No profile information was sent to or saved by an account service.' }); };
  const togglePreference = (key: keyof typeof preferences, title: string) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
    toast.info(`${title} preview updated`, { description: 'This local preference state is not saved to an account or delivery service.' });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="container flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-7">
          <div className="flex items-center gap-3"><span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><User className="size-5" aria-hidden="true" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted">Account preview</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1><p className="mt-1 text-sm text-foreground-secondary">Explore local identity, contact, and preference layouts without an account profile connection.</p></div></div>
          {editing ? <div className="flex gap-2"><button type="button" onClick={cancelEdit} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3.5 py-2.5 text-sm font-semibold text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground focus-visible:outline-none"><X className="size-4" aria-hidden="true" />Cancel</button><button type="button" onClick={saveProfile} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none"><Save className="size-4" aria-hidden="true" />Save locally</button></div> : <button type="button" onClick={beginEdit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none"><Edit3 className="size-4" aria-hidden="true" />Edit preview</button>}
        </div>
      </header>

      <div className="container max-w-5xl py-5 sm:py-7 lg:py-8">
        <aside className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground-secondary" aria-label="Profile preview disclosure">Names, contact fields, membership, verification, protection, and preference values on this page are browser-local preview content. This interface does not retrieve, verify, persist, or deliver profile data.</aside>
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_20px_64px_rgba(3,7,34,0.16)] backdrop-blur-xl"><div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6"><span className="inline-flex size-20 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"><User className="size-9" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-muted">Preview identity</p><h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">{profile.firstName} {profile.lastName}</h2><p className="mt-1 text-sm text-foreground-secondary">{profile.bio}</p><p className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-foreground-muted"><Calendar className="size-3.5" aria-hidden="true" />Account history {profile.joinDate.toLowerCase()}</p></div><span className="sm:ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-3 py-1.5 text-xs font-semibold text-foreground-secondary"><Info className="size-3.5" aria-hidden="true" />Verification unavailable</span></div></section>
          <ProfileCard eyebrow="Identity preview" title="Personal information">{editing ? <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5"><Field label="First name" value={draft.firstName} onChange={(value) => updateDraft('firstName', value)} /><Field label="Last name" value={draft.lastName} onChange={(value) => updateDraft('lastName', value)} /><div className="sm:col-span-2"><Field label="Profile bio" value={draft.bio} onChange={(value) => updateDraft('bio', value)} multiline /></div><Field label="Country" value={draft.country} onChange={(value) => updateDraft('country', value)} /><Field label="City" value={draft.city} onChange={(value) => updateDraft('city', value)} /></div> : <dl className="grid gap-px bg-border sm:grid-cols-2"><Detail label="First name" value={profile.firstName} /><Detail label="Last name" value={profile.lastName} /><Detail label="Profile bio" value={profile.bio} className="sm:col-span-2" /><Detail label="Country" value={profile.country} /><Detail label="City" value={profile.city} /></dl>}</ProfileCard>
          <ProfileCard eyebrow="Contact preview" title="Contact methods"><div className="divide-y divide-border"><ContactRow icon={Mail} label="Email status" value={profile.email} action="Review email boundary" /><ContactRow icon={Phone} label="Phone status" value={profile.phone} action="Review phone boundary" /></div></ProfileCard>
          <ProfileCard eyebrow="Local preferences" title="Account-preference layouts"><div className="divide-y divide-border"><PreferenceRow title="Email-notice layout" description="Toggle a local representation only; no email delivery setting is changed." checked={preferences.email} onChange={() => togglePreference('email', 'Email-notice layout')} /><PreferenceRow title="Marketing-notice layout" description="Toggle a local representation only; no marketing preference is changed." checked={preferences.marketing} onChange={() => togglePreference('marketing', 'Marketing-notice layout')} /><PreferenceRow title="Additional-factor layout" description="Toggle a local representation only; no authentication factor is enabled or disabled." checked={preferences.twoFactor} onChange={() => togglePreference('twoFactor', 'Additional-factor layout')} /></div></ProfileCard>
          <section className="flex gap-3 rounded-2xl border border-warning/30 bg-warning/8 p-4 text-foreground-secondary"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><h2 className="text-sm font-semibold text-warning">Security status unavailable</h2><p className="mt-1 text-sm leading-6">This preview cannot determine account security, identity verification, notification delivery, or authentication-factor status. Use a connected provider to manage sensitive account settings.</p></div></section>
        </div>
      </div>
    </main>
  );
}

function ProfileCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_20px_64px_rgba(3,7,34,0.16)] backdrop-blur-xl"><header className="border-b border-border px-4 py-4 sm:px-5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">{eyebrow}</p><h2 className="mt-0.5 text-base font-semibold">{title}</h2></header>{children}</section>; }
function Detail({ label, value, className = '' }: { label: string; value: string; className?: string }) { return <div className={`min-w-0 bg-card/40 px-4 py-4 sm:px-5 ${className}`}><dt className="text-xs font-medium uppercase tracking-[0.1em] text-foreground-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-foreground">{value}</dd></div>; }
function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) { const classes = 'w-full rounded-xl border border-border bg-background-secondary px-3.5 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-primary focus:ring-2 focus:ring-primary/25'; return <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-foreground-muted">{label}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className={classes} /> : <input value={value} onChange={(event) => onChange(event.target.value)} className={classes} />}</label>; }
function ContactRow({ icon: Icon, label, value, action }: { icon: typeof Mail; label: string; value: string; action: string }) { return <div className="flex items-center gap-3 px-4 py-4 sm:px-5"><span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><Icon className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-[0.1em] text-foreground-muted">{label}</p><p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p></div><button type="button" onClick={() => toast.info(action, { description: 'No contact method is connected or changed in this preview.' })} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none">Review</button></div>; }
function PreferenceRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: () => void }) { return <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-5 text-foreground-secondary">{description}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={title} onClick={onChange} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${checked ? 'bg-primary' : 'bg-background-secondary ring-1 ring-border'}`}><span className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>; }
