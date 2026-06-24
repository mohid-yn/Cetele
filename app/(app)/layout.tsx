import { MockStateProvider } from "@/lib/mock/store";
import { CelebrationProvider } from "@/components/demo/celebration";
import { AppFrame } from "@/components/demo/app-frame";

/**
 * Shell for every in-app prototype screen: mock state + celebration layer +
 * the mobile app frame (ribbon, bottom nav, demo controls).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MockStateProvider>
      <CelebrationProvider>
        <AppFrame>{children}</AppFrame>
      </CelebrationProvider>
    </MockStateProvider>
  );
}
