import ObligationsView from "@/components/ObligationsView";

export default function ContasAPagarPage({ searchParams }: { searchParams: { contact?: string } }) {
  return <ObligationsView key={searchParams.contact || ""} direction="payable" initialContactId={searchParams.contact || ""} />;
}
