import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingGate>
      <div className="flex min-h-screen md:h-screen">
        <Sidebar />
        <div className="flex min-h-screen md:h-auto flex-1 flex-col md:overflow-hidden">
          <Header />
          <main className="flex-1 md:overflow-auto p-4 pb-24 md:p-8 md:pb-8">
            {children}
          </main>
        </div>
        <MobileTabBar />
      </div>
    </OnboardingGate>
  );
}
