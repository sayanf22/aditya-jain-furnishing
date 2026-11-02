"use client";

// Enquiry form (agreement §06 and §07): a customer-type dropdown (B2C
// individual or B2B business / interior designer), saved to D1 and shown in
// the admin dashboard marked B2C or B2B. No email or SMS alerts.
// The same checks run here (instant feedback) and on the server.
import { useState, type FormEvent } from "react";
import { CUSTOMER_TYPES, validateEnquiry, type CustomerType, type FieldErrors } from "@/lib/enquiry-rules";
import { CheckIcon, SendIcon } from "./icons";

type Option = { slug: string; name: string };
type Props = { categories: Option[]; source: string; whatsappHref: string | null };

type State = "idle" | "sending" | "sent" | "error";

export function EnquiryForm({ categories, source, whatsappHref }: Props) {
  const [customerType, setCustomerType] = useState<CustomerType | "">("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<State>("idle");
  const [problem, setProblem] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = {
      customerType: String(form.get("customerType") ?? "") as CustomerType,
      name: String(form.get("name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      company: String(form.get("company") ?? ""),
      interest: String(form.get("interest") ?? ""),
      message: String(form.get("message") ?? ""),
      website: String(form.get("website") ?? ""),
      source,
    };
    const check = validateEnquiry(input);
    setErrors(check.errors);
    if (Object.keys(check.errors).length > 0) {
      const first = Object.keys(check.errors)[0];
      e.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setState("sending");
    setProblem("");
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: FieldErrors };
      if (!res.ok) {
        if (body.fields) setErrors(body.fields);
        setProblem(body.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setProblem("Couldn't send right now. Please check your connection and try again.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="look-panel-in flex min-h-[26rem] flex-col items-center justify-center rounded-[1.75rem] bg-white p-8 text-center shadow-[0_24px_60px_-40px_rgba(31,27,23,0.45)]">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-terracotta text-white">
          <CheckIcon className="h-8 w-8" />
        </span>
        <p className="mt-6 text-[1.4rem] font-medium">Thank you, your enquiry has been sent.</p>
        <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-muted">The showroom has your details and message.</p>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noopener" className="link-line mt-6 text-[0.85rem] font-semibold tracking-[0.08em] text-terracotta uppercase">
            Or chat on WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="rounded-[1.75rem] bg-white p-6 shadow-[0_24px_60px_-40px_rgba(31,27,23,0.45)] sm:p-8"
      aria-describedby={problem ? "enquiry-problem" : undefined}
    >
      <p className="text-[1.25rem] font-medium">Send an enquiry</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
        <Field label="I am" error={errors.customerType} htmlFor="eq-type">
          <select
            id="eq-type"
            name="customerType"
            className="field appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235e554c%22 stroke-width=%221.8%22 stroke-linecap=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:1.1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value as CustomerType)}
            aria-invalid={Boolean(errors.customerType)}
            required
          >
            <option value="" disabled>
              Choose one
            </option>
            {(Object.keys(CUSTOMER_TYPES) as CustomerType[]).map((key) => (
              <option key={key} value={key}>
                {CUSTOMER_TYPES[key]} ({key})
              </option>
            ))}
          </select>
        </Field>

        {/* Firm name, shown only for business / interior designer enquiries.
            It opens smoothly below the dropdown and takes no space when closed. */}
        <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[var(--ease-out-soft)] ${customerType === "B2B" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="pt-4">
              <Field label="Firm or studio name (optional)" error={errors.company} htmlFor="eq-company">
                <input id="eq-company" name="company" className="field" autoComplete="organization" maxLength={100} tabIndex={customerType === "B2B" ? 0 : -1} />
              </Field>
            </div>
          </div>
        </div>
        </div>

        <Field label="Your name" error={errors.name} htmlFor="eq-name">
          <input id="eq-name" name="name" className="field" autoComplete="name" maxLength={80} aria-invalid={Boolean(errors.name)} required />
        </Field>
        <Field label="Mobile number" error={errors.phone} htmlFor="eq-phone">
          <input
            id="eq-phone"
            name="phone"
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="10-digit mobile"
            maxLength={16}
            aria-invalid={Boolean(errors.phone)}
            required
          />
        </Field>

        <Field label="Interested in (optional)" htmlFor="eq-interest" wide>
          <select
            id="eq-interest"
            name="interest"
            defaultValue=""
            className="field appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235e554c%22 stroke-width=%221.8%22 stroke-linecap=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:1.1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
          >
            <option value="">Not sure yet</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Message (optional)" error={errors.message} htmlFor="eq-message" wide>
          <textarea id="eq-message" name="message" rows={3} maxLength={1000} className="field resize-none" placeholder="Tell us what you're looking for" aria-invalid={Boolean(errors.message)} />
        </Field>

        {/* Hidden from people; bots fill it in and are ignored. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      </div>

      {problem && (
        <p id="enquiry-problem" role="alert" className="mt-4 rounded-xl bg-[#b4412c]/8 px-4 py-3 text-[0.88rem] text-[#8f2f1f]">
          {problem}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="btn mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-terracotta text-[0.9rem] font-medium text-white hover:bg-terracotta-dark disabled:cursor-wait disabled:opacity-70"
      >
        <SendIcon className="h-4 w-4" />
        {state === "sending" ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}

function Field({ label, error, htmlFor, wide, children }: { label: string; error?: string; htmlFor: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[0.78rem] font-semibold tracking-[0.06em] text-ink-soft">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-[0.8rem] text-[#a3361f]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
