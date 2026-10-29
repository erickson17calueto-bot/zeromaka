import ObligationsView from "@/components/ObligationsView";

export default function FaturasPage({ searchParams }: { searchParams: { contact?: string } }) {
  return <ObligationsView key={searchParams.contact || ""} direction="receivable" initialContactId={searchParams.contact || ""} />;
}
