import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUp, Trash2 } from 'lucide-react';
import { ApiClientError } from '../../api/client';
import {
  getOrganizationProfile,
  LOGO_MAX_BYTES,
  LOGO_MIN_SIDE,
  LOGO_TYPES,
  removeOrganizationLogo,
  updateOrganizationProfile,
  updateStatementDetails,
  uploadOrganizationLogo,
  type OrganizationProfile,
} from '../../api/organizationProfile';
import { useToast } from '../../components/feedback/toast-context';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { TimezonePicker } from '../../features/organizations/TimezonePicker';
import './WorkspaceRecords.css';
import './OrganizationSettingsPage.css';

type Errors = Record<string, string>;
type Section = 'profile' | 'details' | 'reporting' | 'logo';
const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;

function imageSide(file: File): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    image.src = url;
  });
}

export function OrganizationSettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const organization = useOrganization();
  const id = organization?.selected?.id;
  const [profile, setProfile] = useState<OrganizationProfile>();
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState<Section>();
  const [errors, setErrors] = useState<Errors>({});
  const [errorSection, setErrorSection] = useState<Section>();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      try {
        setProfile(await getOrganizationProfile(id, signal));
        setFailed(false);
      } catch (failure) {
        if (!signal?.aborted) setFailed(true);
        void failure;
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    setProfile(undefined);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function save(
    section: Section,
    call: () => Promise<{ data: OrganizationProfile }>,
    done = t('organization-settings:saved'),
  ) {
    setSaving(section);
    setNotice('');
    setErrors({});
    try {
      const result = await call();
      setProfile(result.data);
      toast.success(done);
    } catch (failure) {
      const status = failure instanceof ApiClientError ? failure.status : 0;
      if (status === 409 || status === 403) {
        await load();
        setReloads((value) => value + 1);
        setNotice(
          t(status === 409 ? 'organization-settings:conflict' : 'organization-settings:lostGrant'),
        );
      } else if (status === 400 && failure instanceof ApiClientError && failure.details) {
        setErrors(failure.details as Errors);
        setErrorSection(section);
      } else if (status === 503 && section === 'logo') {
        toast.error(failure instanceof ApiClientError ? failure.message : '');
      } else {
        toast.error(
          failure instanceof ApiClientError
            ? failure.message
            : t('organization-settings:saveFailed'),
        );
      }
    } finally {
      setSaving(undefined);
    }
  }

  if (!id) return null;
  if (failed && !profile) {
    return (
      <div className="workspace-records">
        <p role="alert">{t('organization-settings:loadError')}</p>
        <button className="admin-secondary-action" type="button" onClick={() => void load()}>
          {t('organization-settings:retry')}
        </button>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="workspace-records">
        <p role="status">{t('organization-settings:loading')}</p>
      </div>
    );
  }

  const contact = {
    contactEmail: profile.contactEmail ?? '',
    contactPhone: profile.contactPhone ?? '',
    website: profile.website ?? '',
    reportingTimezone: profile.reportingTimezone,
  };
  const fieldErrors = (section: Section): Errors => (errorSection === section ? errors : {});

  return (
    <div className="workspace-records organization-settings">
      <header className="workspace-records-header">
        <div>
          <h1>{t('organization-settings:title')}</h1>
          <p>{t('organization-settings:intro')}</p>
        </div>
      </header>
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      <ProfileCard
        key={`profile-${reloads}`}
        profile={profile}
        busy={saving !== undefined}
        errors={fieldErrors('profile')}
        onSave={(values) =>
          save('profile', () =>
            updateOrganizationProfile(
              id,
              { ...values, reportingTimezone: profile.reportingTimezone },
              profile.version,
            ),
          )
        }
        logo={
          <LogoField
            profile={profile}
            busy={saving !== undefined}
            onChoose={(file) =>
              save(
                'logo',
                () => uploadOrganizationLogo(id, file, profile.version),
                t('organization-settings:logoSaved'),
              )
            }
            onRemove={() =>
              save(
                'logo',
                () => removeOrganizationLogo(id, profile.version),
                t('organization-settings:logoRemoved'),
              )
            }
          />
        }
      />
      <DetailsCard
        key={`details-${reloads}`}
        profile={profile}
        busy={saving !== undefined}
        errors={fieldErrors('details')}
        onSave={(values) =>
          save('details', () => updateStatementDetails(id, values, profile.version))
        }
      />
      <ReportingCard
        key={`reporting-${reloads}`}
        profile={profile}
        busy={saving !== undefined}
        errors={fieldErrors('reporting')}
        onSave={(zone) =>
          save('reporting', () =>
            updateOrganizationProfile(id, { ...contact, reportingTimezone: zone }, profile.version),
          )
        }
      />
    </div>
  );
}

function Card({
  title,
  help,
  readOnlyNote,
  children,
}: {
  title: string;
  help: string;
  readOnlyNote?: string;
  children: ReactNode;
}) {
  const heading = useId();
  return (
    <section className="workspace-records-panel settings-card" aria-labelledby={heading}>
      <header className="settings-card-header">
        <h2 id={heading}>{title}</h2>
        <p>{help}</p>
        {readOnlyNote && (
          <p className="workspace-records-field-note" data-testid="read-only-note">
            {readOnlyNote}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  readOnly,
  type = 'text',
  maxLength,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  readOnly: boolean;
  type?: string;
  maxLength: number;
  hint?: string;
}) {
  const errorId = useId();
  return (
    <label className="workspace-records-field">
      {label}
      <input
        name={name}
        type={type}
        value={value}
        maxLength={maxLength}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && !error && <small className="workspace-records-field-note">{hint}</small>}
      {error && (
        <small id={errorId} role="alert" className="settings-field-error">
          {error}
        </small>
      )}
    </label>
  );
}

function ProfileCard({
  profile,
  busy,
  errors,
  onSave,
  logo,
}: {
  profile: OrganizationProfile;
  busy: boolean;
  errors: Errors;
  onSave: (values: { contactEmail: string; contactPhone: string; website: string }) => void;
  logo: ReactNode;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(profile.contactEmail ?? '');
  const [phone, setPhone] = useState(profile.contactPhone ?? '');
  const [website, setWebsite] = useState(profile.website ?? '');
  const readOnly = !profile.canEditProfile;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!readOnly) onSave({ contactEmail: email, contactPhone: phone, website });
  }
  return (
    <Card
      title={t('organization-settings:profile')}
      help={t('organization-settings:profileHelp')}
      readOnlyNote={readOnly ? t('organization-settings:needsMembers') : undefined}
    >
      <div className="settings-name">
        <span>{t('organization-settings:displayName')}</span>
        <strong>{profile.displayName}</strong>
        <small className="workspace-records-field-note">
          {t('organization-settings:displayNameHelp')}{' '}
          {supportEmail && (
            <a href={`mailto:${supportEmail}?subject=${encodeURIComponent(profile.displayName)}`}>
              {t('organization-settings:contactTicketBox')}
            </a>
          )}
        </small>
      </div>
      {logo}
      <form className="workspace-records-form settings-form" noValidate onSubmit={submit}>
        <Field
          label={t('organization-settings:contactEmail')}
          name="contactEmail"
          type="email"
          value={email}
          onChange={setEmail}
          error={errors.contactEmail}
          readOnly={readOnly}
          maxLength={254}
        />
        <Field
          label={t('organization-settings:contactPhone')}
          name="contactPhone"
          type="tel"
          value={phone}
          onChange={setPhone}
          error={errors.contactPhone}
          readOnly={readOnly}
          maxLength={32}
        />
        <Field
          label={t('organization-settings:website')}
          name="website"
          type="url"
          value={website}
          onChange={setWebsite}
          error={errors.website}
          readOnly={readOnly}
          maxLength={2048}
          hint={t('organization-settings:websiteHint')}
        />
        {!readOnly && (
          <div className="workspace-records-actions">
            <button className="admin-primary-action" type="submit" disabled={busy}>
              {t('organization-settings:saveProfile')}
            </button>
          </div>
        )}
      </form>
    </Card>
  );
}

function LogoField({
  profile,
  busy,
  onChoose,
  onRemove,
}: {
  profile: OrganizationProfile;
  busy: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [problem, setProblem] = useState('');
  const editable = profile.canEditProfile;

  async function choose(file: File | undefined) {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return setProblem(t('organization-settings:logoBadType'));
    if (file.size > LOGO_MAX_BYTES) return setProblem(t('organization-settings:logoTooLarge'));
    const size = await imageSide(file);
    if (size && (size.width < LOGO_MIN_SIDE || size.height < LOGO_MIN_SIDE)) {
      return setProblem(t('organization-settings:logoTooSmall'));
    }
    setProblem('');
    onChoose(file);
  }

  return (
    <fieldset className="settings-logo" disabled={busy}>
      <legend>{t('organization-settings:logo')}</legend>
      <div className="settings-logo-frame" data-empty={!profile.logoUrl || undefined}>
        {profile.logoUrl ? (
          <img
            src={profile.logoUrl}
            alt={t('organization-settings:logoAlt', { name: profile.displayName })}
          />
        ) : (
          <ImageUp size={28} aria-hidden />
        )}
      </div>
      <div className="settings-logo-side">
        <p className="workspace-records-field-note">{t('organization-settings:logoHelp')}</p>
        {editable && (
          <div className="workspace-records-actions">
            <label className="admin-secondary-action" htmlFor={inputId}>
              <ImageUp size={16} aria-hidden />
              {t(
                profile.logoUrl
                  ? 'organization-settings:logoReplace'
                  : 'organization-settings:logoChoose',
              )}
            </label>
            <input
              id={inputId}
              className="event-visually-hidden"
              type="file"
              accept={LOGO_TYPES.join(',')}
              onChange={(event) => {
                void choose(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {profile.logoUrl && (
              <button type="button" className="admin-secondary-action" onClick={onRemove}>
                <Trash2 size={16} aria-hidden />
                {t('organization-settings:logoRemove')}
              </button>
            )}
          </div>
        )}
        {problem && (
          <p role="alert" className="settings-field-error">
            {problem}
          </p>
        )}
      </div>
    </fieldset>
  );
}

function DetailsCard({
  profile,
  busy,
  errors,
  onSave,
}: {
  profile: OrganizationProfile;
  busy: boolean;
  errors: Errors;
  onSave: (values: { legalName: string; taxCode: string; billingAddress: string }) => void;
}) {
  const { t } = useTranslation();
  const [legalName, setLegalName] = useState(profile.legalName ?? '');
  const [taxCode, setTaxCode] = useState(profile.taxCode ?? '');
  const [billingAddress, setBillingAddress] = useState(profile.billingAddress ?? '');
  const readOnly = !profile.canEditStatementDetails;
  return (
    <Card
      title={t('organization-settings:details')}
      help={t('organization-settings:detailsHelp')}
      readOnlyNote={readOnly ? t('organization-settings:needsMembersOrFinance') : undefined}
    >
      <form
        className="workspace-records-form settings-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!readOnly) onSave({ legalName, taxCode, billingAddress });
        }}
      >
        <Field
          label={t('organization-settings:legalName')}
          name="legalName"
          value={legalName}
          onChange={setLegalName}
          error={errors.legalName}
          readOnly={readOnly}
          maxLength={200}
        />
        <Field
          label={t('organization-settings:taxCode')}
          name="taxCode"
          value={taxCode}
          onChange={setTaxCode}
          error={errors.taxCode}
          readOnly={readOnly}
          maxLength={20}
          hint={t('organization-settings:taxCodeHint')}
        />
        <Field
          label={t('organization-settings:billingAddress')}
          name="billingAddress"
          value={billingAddress}
          onChange={setBillingAddress}
          error={errors.billingAddress}
          readOnly={readOnly}
          maxLength={500}
        />
        {!readOnly && (
          <div className="workspace-records-actions">
            <button className="admin-primary-action" type="submit" disabled={busy}>
              {t('organization-settings:saveDetails')}
            </button>
          </div>
        )}
      </form>
    </Card>
  );
}

function ReportingCard({
  profile,
  busy,
  errors,
  onSave,
}: {
  profile: OrganizationProfile;
  busy: boolean;
  errors: Errors;
  onSave: (zone: string) => void;
}) {
  const { t } = useTranslation();
  const [zone, setZone] = useState(profile.reportingTimezone);
  const readOnly = !profile.canEditProfile;
  return (
    <Card
      title={t('organization-settings:reporting')}
      help={t('organization-settings:reportingHelp')}
      readOnlyNote={readOnly ? t('organization-settings:needsMembers') : undefined}
    >
      <form
        className="workspace-records-form settings-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!readOnly) onSave(zone);
        }}
      >
        <TimezonePicker
          value={zone}
          onChange={setZone}
          disabled={readOnly}
          invalid={!!errors.reportingTimezone}
        />
        {errors.reportingTimezone && (
          <p role="alert" className="settings-field-error">
            {errors.reportingTimezone}
          </p>
        )}
        {!readOnly && (
          <div className="workspace-records-actions">
            <button className="admin-primary-action" type="submit" disabled={busy}>
              {t('organization-settings:saveReporting')}
            </button>
          </div>
        )}
      </form>
    </Card>
  );
}
