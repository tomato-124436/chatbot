import { Landing } from "@/app/landing";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return <Landing authError={params.error === "auth"} />;
}
