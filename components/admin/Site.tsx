"use client";

// Site: the named photo places, business details and testimonials.
// Photo and detail edits are held until the page-wide Save.
import { useState } from "react";
import { SITE_IMAGE_SLOTS, isReplaceableSlot, type SiteImage, type SiteSettings } from "@/lib/admin-api";
import { ApiFailure, api, asFailure } from "./api";
import { useResource } from "./hooks";
import { IconReplace, IconTrash } from "./icons";
import { MediaPicker } from "./MediaPicker";
import { Photo } from "./Photo";
import { Testimonials } from "./Testimonials";
import { Badge, Button, ErrorNote, Field, Loading, PageHeader, PageSaveBar, Segmented, TextInput, cx, useToast } from "./ui";

type Tab = "photos" | "details" | "reviews";
type PhotoChoice = { mediaKey: string | null; alt: string | null };

const GROUPS = ["About", "Contact"] as const;

const DETAIL_FIELDS: { key: keyof SiteSettings; label: string; hint?: string; inputMode?: "tel" | "text"; autoComplete?: string }[] = [
  { key: "businessName", label: "Business name" },
  { key: "legalName", label: "Legal name" },
  { key: "addressLine1", label: "Address, line 1" },
  { key: "addressLine2", label: "Address, line 2" },
  { key: "phone", label: "Phone number", hint: "Digits with country code, like 919811268268. Used for calls and messages.", inputMode: "tel" },
  { key: "phoneDisplay", label: "Phone as shown", hint: "How the number looks on the site" },
  { key: "gstin", label: "GSTIN" },
  { key: "instagramHandle", label: "Instagram name", hint: "Without the @" },
];

export function SiteScreen() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("photos");
  const images = useResource<{ slots: SiteImage[] }>("/site/images");
  const settings = useResource<SiteSettings>("/site/settings");
  const [photoDraft, setPhotoDraft] = useState<Record<string, PhotoChoice>>({});
  const [detailDraft, setDetailDraft] = useState<Partial<SiteSettings>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const imageData = images.data;
  const settingsData = settings.data;
  const dirty = Object.keys(photoDraft).length > 0 || Object.keys(detailDraft).length > 0;

  function choosePhoto(slot: SiteImage, choice: PhotoChoice) {
    setPhotoDraft((draft) => {
      const next = { ...draft };
      if (choice.mediaKey === slot.mediaKey) delete next[slot.slot];
      else next[slot.slot] = choice;
      return next;
    });
  }

  function editDetail<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setDetailDraft((draft) => {
      const next = { ...draft, [key]: value };
      if (settingsData && settingsData[key] === value) delete next[key];
      return next;
    });
  }

  function cancel() {
    setPhotoDraft({});
    setDetailDraft({});
    setFailure(null);
  }

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      for (const [slot, choice] of Object.entries(photoDraft)) {
        await api.put(`/site/images/${slot}`, { mediaKey: choice.mediaKey, alt: choice.alt });
        setPhotoDraft((draft) => {
          const next = { ...draft };
          delete next[slot];
          return next;
        });
      }
      if (Object.keys(detailDraft).length) {
        await api.patch("/site/settings", detailDraft);
        setDetailDraft({});
      }
      toast("Saved");
      images.reload();
      settings.reload();
    } catch (error) {
      setFailure(asFailure(error));
      images.reload();
      settings.reload();
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (key: string) => (failure?.field === key ? failure.message : null);
  const generalError = failure && !failure.field ? failure.message : null;
  const photoCount = Object.keys(photoDraft).length;

  return (
    <>
      <PageHeader title="Site" />
      <Segmented
        label="Site sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: "photos", label: "Photos", count: photoCount },
          { value: "details", label: "Details", count: Object.keys(detailDraft).length },
          { value: "reviews", label: "Reviews" },
        ]}
      />

      <div className="a-tabpanel">
        {tab === "photos" &&
          (images.error && !imageData ? (
            <ErrorNote error={images.error} onRetry={images.reload} />
          ) : !imageData ? (
            <Loading />
          ) : (
            <div className="a-stack a-stack--lg">
              {GROUPS.map((group) => {
                const slots = imageData.slots.filter((slot) => slot.group === group && isReplaceableSlot(slot.slot));
                if (slots.length === 0) return null;
                return (
                  <section key={group} aria-label={group}>
                    <h2 className="a-sectiontitle">{group}</h2>
                    <ul className="a-card a-card--flush a-list">
                      {slots.map((slot) => (
                        <SlotRow key={slot.slot} slot={slot} choice={photoDraft[slot.slot]} onChoose={(choice) => choosePhoto(slot, choice)} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ))}

        {tab === "details" &&
          (settings.error && !settingsData ? (
            <ErrorNote error={settings.error} onRetry={settings.reload} />
          ) : !settingsData ? (
            <Loading />
          ) : (
            <div className="a-card a-form">
              {DETAIL_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint} error={fieldError(field.key)}>
                  <TextInput
                    value={detailDraft[field.key] ?? settingsData[field.key]}
                    onChange={(event) => editDetail(field.key, event.target.value)}
                    inputMode={field.inputMode}
                    maxLength={120}
                  />
                </Field>
              ))}
            </div>
          ))}

        {tab === "reviews" && <Testimonials />}
      </div>

      <PageSaveBar dirty={dirty} saving={saving} error={generalError} onSave={save} onCancel={cancel} />
    </>
  );
}

function SlotRow({ slot, choice, onChoose }: { slot: SiteImage; choice?: PhotoChoice; onChoose: (choice: PhotoChoice) => void }) {
  const [picking, setPicking] = useState(false);
  const definition = SITE_IMAGE_SLOTS.find((item) => item.slot === slot.slot) ?? slot;
  const mediaKey = choice ? choice.mediaKey : slot.mediaKey;
  const usingDefault = mediaKey === null;
  return (
    <li className={cx("a-row a-row--slot", choice && "is-changed")}>
      <span className={cx("a-slotthumb", `is-${slot.shape}`)}>
        <Photo
          mediaKey={mediaKey ?? definition.defaultKey}
          alt=""
          width={slot.shape === "wide" ? 800 : 480}
          widths={usingDefault || choice ? undefined : slot.media?.widths}
        />
      </span>
      <span className="a-row__text">
        <span className="a-row__name">{slot.label}</span>
        <span className="a-row__meta">{usingDefault ? <Badge>Default</Badge> : definition.hint}</span>
      </span>
      <div className="a-row__actions">
        {!usingDefault && (
          <Button variant="ghost" icon={<IconTrash />} onClick={() => onChoose({ mediaKey: null, alt: null })} aria-label={`Remove your photo from ${slot.label}. The default returns.`}>
            Remove
          </Button>
        )}
        <Button icon={<IconReplace />} onClick={() => setPicking(true)}>
          Replace
        </Button>
      </div>
      {picking && (
        <MediaPicker
          title={slot.label}
          widths={definition.widths}
          onPick={(assets) => assets[0] && onChoose({ mediaKey: assets[0].key, alt: assets[0].alt })}
          onClose={() => setPicking(false)}
        />
      )}
    </li>
  );
}