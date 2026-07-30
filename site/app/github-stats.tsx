"use client";

import { useEffect, useState } from "react";

type RepositoryStats = {
  forks_count: number;
  stargazers_count: number;
};

const statsUrl =
  "https://api.github.com/repos/taekchef/claude-code-zh-cn";
const formatter = new Intl.NumberFormat("zh-CN");

export function GitHubStats() {
  const [stats, setStats] = useState<RepositoryStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(statsUrl, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub API ${response.status}`);
        return response.json() as Promise<RepositoryStats>;
      })
      .then(setStats)
      .catch(() => {});

    return () => controller.abort();
  }, []);

  return (
    <>
      <div aria-live="polite">
        <strong>
          {stats ? formatter.format(stats.stargazers_count) : "…"}
        </strong>
        <span>GitHub Stars</span>
      </div>
      <div aria-live="polite">
        <strong>{stats ? formatter.format(stats.forks_count) : "…"}</strong>
        <span>GitHub Forks</span>
      </div>
    </>
  );
}
