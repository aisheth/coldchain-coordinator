import { Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportKind } from "@/lib/master-import";
export function ImportLink({ area }: { area: ImportKind }) {
  return (
    <Button asChild variant="outline">
      <Link to="/imports" search={{ area }}>
        <Upload className="h-4 w-4" />
        Import CSV
      </Link>
    </Button>
  );
}
