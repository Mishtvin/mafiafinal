"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [nickname, setNickname] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      // Запрос к вашему токен-серверу для получения JWT
      const res = await fetch(`/token?identity=${encodeURIComponent(nickname)}&room=default-room`);
      if (!res.ok) {
        throw new Error("Ошибка получения токена");
      }
      const data = await res.json();

      // Перенаправляем пользователя на кастомную комнату,
      // где передаём LiveKit URL и полученный токен
      router.push(
        `/custom?liveKitUrl=${encodeURIComponent("wss://livekit.nyavkin.site")}&token=${encodeURIComponent(data.token)}`
      );
    } catch (error: any) {
      console.error("Ошибка:", error);
      alert("Ошибка: " + error.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "50px" }}>
      <h1>Вход в комнату</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Введите ваш никнейм"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          style={{ padding: "8px", fontSize: "16px" }}
        />
        <button type="submit" style={{ padding: "10px 20px", fontSize: "16px", marginTop: "10px" }}>
          Войти
        </button>
      </form>
    </div>
  );
}
