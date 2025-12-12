"use client";

import { useState } from "react";

export default function UploadTestPage() {
  const [result, setResult] = useState<any>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const parishInput = form.elements.namedItem("parish_id") as HTMLInputElement;
    const userIdInput = form.elements.namedItem("user_id") as HTMLInputElement;
    const usernameInput = form.elements.namedItem("username") as HTMLInputElement;

    if (!fileInput.files || fileInput.files.length === 0) {
      alert("Please choose a file");
      return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("file", file);
    formData.append("parish_id", parishInput.value || "");
    formData.append("user_id", userIdInput.value || "");
    formData.append("username", usernameInput.value || "");

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const json = await res.json();
    setResult(json);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Upload Test</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Parish ID:{" "}
            <input name="parish_id" defaultValue="1" />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            User ID:{" "}
            <input name="user_id" defaultValue="1" />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Username:{" "}
            <input name="username" defaultValue="sysadmin@example.com" />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            File:{" "}
            <input name="file" type="file" />
          </label>
        </div>
        <button type="submit">Upload</button>
      </form>

      {result && (
        <pre
          style={{
            marginTop: 24,
            background: "#111",
            color: "#0f0",
            padding: 16,
            maxWidth: 800,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
