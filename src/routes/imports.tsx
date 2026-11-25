import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, LoaderCircle, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Field, selectCls } from "@/components/app/ui";
import { useStore } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import {
  importDefinitions,
  importRows,
  previewCsv,
  rowsCsv,
  templateCsv,
  type ImportContext,
  type ImportKind,
  type ImportRow,
} from "@/lib/master-import";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/imports")({
  validateSearch: (search: Record<string, unknown>): { area?: ImportKind } =>
    typeof search["area"] === "string" && Object.hasOwn(importDefinitions, search["area"])
      ? { area: search["area"] as ImportKind }
      : {},
  head: () =>
    meta("Master data import", "Review CSV master data and confirm each import into ColdTrack."),
  component: MasterImport,
});
function MasterImport() {
  const { area } = Route.useSearch();
  const { user, loadImportContext, importMasterRow, refresh } = useStore();
  const [kind, setKind] = useState<ImportKind>(area ?? "items");
  const [context, setContext] = useState<ImportContext | null>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  useBlocker({
    shouldBlockFn: () =>
      busy ||
      (rows.some((row) => ["saved", "failed", "uncertain"].includes(row.status)) &&
        !window.confirm(
          "Leave this import report? Download it first if you need the row results. Saved records will remain.",
        )),
    enableBeforeUnload: busy,
  });
  useEffect(() => {
    let active = true;
    loadImportContext()
      .then((result) => {
        if (active) {
          setContext(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadImportContext]);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await loadImportContext();
      setContext(next);
      return next;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setRows([]);
    setConfirmed(false);
    setError("");
    if (file.size > 2_000_000) {
      setError("CSV exceeds the 2 MB limit.");
      return;
    }
    try {
      const source = await file.text();
      setText(source);
      const current = await load();
      if (current) setRows(previewCsv(source, kind, current));
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function reviewAgain() {
    const current = await load();
    if (!current) return;
    try {
      const reviewed = previewCsv(text, kind, current);
      setRows(
        reviewed.map((row) => {
          const previous = rows.find((entry) => entry.record === row.record);
          if (previous?.status === "saved") return previous;
          if (previous?.status === "uncertain")
            return {
              ...previous,
              errors: row.errors,
              message: `${previous.message} ${row.errors.length ? "Matching/invalid saved data detected; inspect before any further import." : "No matching row detected yet; this row is still excluded to avoid a duplicate. Check the backend before uploading it again."}`,
            };
          return row;
        }),
      );
      setConfirmed(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function save() {
    if (!context || !confirmed || busy) return;
    setBusy(true);
    setError("");
    setConfirmed(false);
    try {
      // Revalidate against fresh saved data immediately before the first write.
      const current = await loadImportContext();
      setContext(current);
      const validation = previewCsv(text, kind, current);
      const reviewed = rows.map((row) =>
        row.status === "ready"
          ? { ...(validation.find((entry) => entry.record === row.record) ?? row) }
          : row,
      );
      setRows(reviewed);
      await importRows(reviewed, (row) => importMasterRow(kind, row, current, password), setRows);
      setPassword("");
      try {
        await refresh(true);
      } catch (err) {
        setError(
          `Row save results are retained, but refreshing saved data failed. ${errorMessage(err)}`,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const ready = rows.filter((row) => row.status === "ready").length;
  const saved = rows.filter((row) => row.status === "saved").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const uncertain = rows.filter((row) => row.status === "uncertain").length;
  const invalid = rows.filter((row) => row.status === "invalid").length;
  if (!user || user.role === "worker")
    return <p>Master data imports require an owner/admin account.</p>;
  return (
    <>
      <PageHeader title="Import master data" subtitle="CSV review and save results" />
      <div className="max-w-4xl space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Master data area" className="min-w-56">
            <select
              aria-label="Master data area"
              className={selectCls}
              value={kind}
              disabled={busy}
              onChange={(event) => {
                setKind(event.target.value as ImportKind);
                setRows([]);
                setText("");
                setConfirmed(false);
                setPassword("");
              }}
            >
              {Object.entries(importDefinitions)
                .filter(([key]) => key !== "workers" || user.role === "owner")
                .map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
            </select>
          </Field>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              downloadBlob(
                new Blob([templateCsv(kind)], { type: "text/csv;charset=utf-8" }),
                `coldtrack-${kind}-template.csv`,
              )
            }
          >
            <Download className="h-4 w-4" />
            Template
          </Button>
          <Button variant="outline" disabled={busy || loading} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Refresh saved data
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Up to 1,000 rows / 2 MB. Existing records are not overwritten. Import categories, sizes
          and units first, then items, then variants. Variant columns use saved item names, size
          labels and UOM codes; blank size means Standard.
        </p>
        {kind === "workers" && (
          <p className="text-sm text-muted-foreground">
            Owner only. Creates worker accounts, never owner/admin accounts. Passwords are excluded
            from CSV files and reports.
          </p>
        )}
        {loading && (
          <p className="flex items-center gap-2 text-sm">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading saved master data…
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Field label="CSV file">
          <Input
            key={kind}
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            disabled={busy || loading || !context || (kind === "workers" && user.role !== "owner")}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </Field>
        {rows.length > 0 && (
          <>
            <p role="status" className="text-sm font-medium">
              {rows.length} total · {ready} ready · {invalid} invalid/duplicate · {saved} saved ·{" "}
              {failed} failed · {uncertain} unknown
            </p>
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-3">Row</th>
                    <th className="p-3">Values</th>
                    <th className="p-3">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.record}>
                      <td className="p-3 align-top">{row.record}</td>
                      <td className="max-w-sm break-words p-3 align-top">
                        {Object.entries(row.values)
                          .filter(([, value]) => value)
                          .map(([key, value]) => (
                            <p key={key}>
                              <span className="text-muted-foreground">{key}: </span>
                              {value}
                            </p>
                          ))}
                      </td>
                      <td className="max-w-sm break-words p-3 align-top">
                        <span
                          className={
                            row.status === "saved"
                              ? "text-success"
                              : row.errors.length ||
                                  row.status === "failed" ||
                                  row.status === "uncertain"
                                ? "text-danger"
                                : "text-muted-foreground"
                          }
                        >
                          {row.status}
                        </span>
                        <p>{row.errors.join(" ") || row.message}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {kind === "workers" && ready > 0 && (
              <Field label="Temporary password for this confirmed batch (8–128 characters)">
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">
                  Used only for new worker accounts in this batch; not stored as a draft. Backend
                  password-change requirements still apply.
                </span>
              </Field>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || !ready}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1 accent-primary"
              />
              <span>
                Confirm saving {ready} valid rows. Invalid and duplicate rows will be skipped.
              </span>
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  !confirmed ||
                  !ready ||
                  busy ||
                  (kind === "workers" &&
                    (user.role !== "owner" || password.length < 8 || password.length > 128))
                }
                onClick={() => void save()}
              >
                {busy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {busy ? "Importing…" : "Save confirmed rows"}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void reviewAgain()}>
                <RefreshCw className="h-4 w-4" />
                Recheck failed / invalid rows
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  downloadBlob(
                    new Blob([rowsCsv(rows, kind)], { type: "text/csv;charset=utf-8" }),
                    `coldtrack-${kind}-results.csv`,
                  )
                }
              >
                <Download className="h-4 w-4" />
                Download results
              </Button>
            </div>
            {uncertain > 0 && (
              <p className="text-sm text-danger">
                Unknown save outcomes are excluded from retries. Check saved records before making a
                separate import.
              </p>
            )}
            {busy && (
              <p className="text-sm text-muted-foreground">
                Keep this page open until every row has a result.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
