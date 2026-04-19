"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy /dashboard route — redirects to Home (/).
 */
export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}
