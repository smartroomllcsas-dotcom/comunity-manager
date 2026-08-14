import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchInstagramProfile } from "./meta-webhook";

describe("fetchInstagramProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resuelve nombre, usuario y foto desde el IGSID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "Cliente Instagram",
          username: "cliente.demo",
          profile_pic: "https://cdn.example/profile.jpg",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchInstagramProfile("page-token", "1792391498779119");

    expect(profile).toEqual({
      name: "Cliente Instagram",
      profile_picture_url: "https://cdn.example/profile.jpg",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/1792391498779119?fields=name,username,profile_pic&access_token=page-token")
    );
  });

  it("usa @username cuando Meta no entrega un nombre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ username: "cliente.demo" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await expect(fetchInstagramProfile("page-token", "igsid-1")).resolves.toEqual({
      name: "@cliente.demo",
      profile_picture_url: null,
    });
  });

  it("mantiene el IGSID como respaldo cuando Meta niega el perfil", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Unsupported get request" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await expect(fetchInstagramProfile("page-token", "igsid-1")).resolves.toBeNull();
  });
});
