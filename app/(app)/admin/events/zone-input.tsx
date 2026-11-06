"use client";

import * as React from "react";
import { Field, Input } from "@/components/ui";
import { zoneCity } from "@/lib/events";

/**
 * The venue's time zone: free text with every IANA zone as a suggestion.
 * Defaults to the steward's own, which is right almost every time.
 */
export function ZoneInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const zones = React.useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [] as string[];
    }
  }, []);
  const valid = zones.length === 0 || zones.includes(value);
  return (
    <Field
      label="Time zone of the venue"
      htmlFor={id}
      hint={valid ? `Times below are ${zoneCity(value)} time.` : undefined}
      error={
        valid
          ? undefined
          : "Pick a zone from the list, like Australia/Melbourne."
      }
    >
      <Input
        id={id}
        list={`${id}-list`}
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={`${id}-list`}>
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </Field>
  );
}
