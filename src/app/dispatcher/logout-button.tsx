"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/dispatcher/login");
        router.refresh();
      }}
      className="text-sm text-neutral-400 hover:text-neutral-100"
    >
      Выйти
    </button>
  );
}
