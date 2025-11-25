import HukamnamaDisplay from "@/components/HukamnamaDisplay";

export default function Home() {
  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2 py-8">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl text-primary">
            Daily Hukamnama
          </h1>
        </div>

        <HukamnamaDisplay />
      </div>
    </main>
  );
}
