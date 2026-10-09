"use client";

import { useEffect, useState } from "react";
import { GithubMark } from "@/components/Icons";

const MESSAGES: Record<string, string> = {
  state: "로그인 요청을 확인할 수 없습니다. 다시 시도해 주세요.",
  denied: "GitHub 로그인이 취소되었습니다.",
  github: "GitHub 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  config: "서버에 GitHub OAuth 설정이 없습니다. docs/AUTH.md를 확인하세요.",
};

export function LoginScreen() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("login_error");
    if (code) {
      setMessage(MESSAGES[code] ?? "로그인에 실패했습니다.");
      window.history.replaceState(null, "", "/");
    }
  }, []);

  return (
    <div className="login">
      <div className="login-card">
        <h1>할 일 관리</h1>
        <p>
          1년 목표부터 오늘 할 일까지 한 곳에서 관리하세요.
          <br />
          계속하려면 로그인이 필요합니다.
        </p>
        {message && <p className="error" role="alert">{message}</p>}
        <a className="login-button" href="/auth/github">
          <GithubMark />
          GitHub로 로그인
        </a>
      </div>
    </div>
  );
}
