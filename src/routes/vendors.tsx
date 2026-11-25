import { useDraft, draftField } from "@/lib/drafts";
import { DraftNotice } from "@/components/app/DraftNotice";
import { ImportLink } from "@/components/app/ImportLink";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LoaderCircle, MapPin, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader, Field } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/vendors")({
  head: () => meta("Vendors", "Live suppliers for cold storage procurement."),
  component: Vendors,
});

function Vendors() {
  const { state, user, addVendor } = useStore();
  const draft = useDraft(user, "master:vendors:new", {
    name: "",
    contact: "",
    phone: "",
    address: "",
  });
  const d = draft.data;
  const setD = draft.setData;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add() {
    setBusy(true);
    setError("");
    try {
      await addVendor(d);
      draft.clear();
      toast.success("Vendor added");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Where your team collects materials."
        actions={<ImportLink area="vendors" />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.vendors.map((v) => (
          <Card key={v.id} className="p-5 text-sm">
            <p className="font-semibold">{v.name}</p>
            <p className="mt-3 flex gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              {v.address || "Address not provided"}
            </p>
            <p className="mt-1 flex gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {v.contact || "Contact not provided"}
              {v.phone ? ` · ${v.phone}` : ""}
            </p>
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              {state.tasks.filter((t) => t.vendorId === v.id).length} procurement tasks
            </p>
          </Card>
        ))}
        <Card className="space-y-3 border-dashed p-5">
          <p className="font-semibold">Add vendor</p>
          <DraftNotice draft={draft} />
          <fieldset disabled={draft.pending || busy} className="space-y-3">
            {(["name", "contact", "phone", "address"] as const).map((k) => (
              <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                <Input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
              </Field>
            ))}
            <p className="text-xs text-muted-foreground">
              Vendor specialty is not supported by the live API.
            </p>
            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                {error}
              </p>
            )}
            <Button disabled={!d.name || busy} onClick={() => void add()}>
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add vendor
            </Button>
          </fieldset>
        </Card>
      </div>
    </>
  );
}
