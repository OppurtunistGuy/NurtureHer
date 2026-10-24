import { describe, expect, it } from "vitest";
import { remoteStorageConfig } from "./remote-storage-config.server";

describe("Turso environment configuration", () => {
  it("accepts the canonical URL with the integration-prefixed token", () => {
    expect(
      remoteStorageConfig({
        TURSO_DATABASE_URL: "libsql://uat.example",
        TURSO_DATABASE_TURSO_AUTH_TOKEN: "test-token",
      }),
    ).toEqual({ url: "libsql://uat.example", authToken: "test-token" });
  });
  it("accepts the existing Marketplace prefix without renaming secrets", () => {
    expect(
      remoteStorageConfig({
        TURSO_DATABASE_TURSO_DATABASE_URL: " libsql://uat.example ",
        TURSO_DATABASE_TURSO_AUTH_TOKEN: " test-token ",
      }),
    ).toEqual({ url: "libsql://uat.example", authToken: "test-token" });
  });
  it("prefers the explicit canonical pair", () => {
    expect(
      remoteStorageConfig({
        TURSO_DATABASE_URL: "https://canonical.example",
        TURSO_AUTH_TOKEN: "canonical-token",
        TURSO_DATABASE_TURSO_DATABASE_URL: "https://other.example",
        TURSO_DATABASE_TURSO_AUTH_TOKEN: "other-token",
      }),
    ).toEqual({ url: "https://canonical.example", authToken: "canonical-token" });
  });
  it("never pairs a canonical URL with a different integration's token", () => {
    expect(() =>
      remoteStorageConfig({
        TURSO_DATABASE_URL: "https://canonical.example",
        TURSO_DATABASE_TURSO_DATABASE_URL: "https://other.example",
        TURSO_DATABASE_TURSO_AUTH_TOKEN: "other-token",
      }),
    ).toThrow("REMOTE_DATABASE_NOT_CONFIGURED");
  });
  it("rejects incomplete integration credentials and local file URLs", () => {
    expect(() =>
      remoteStorageConfig({
        TURSO_DATABASE_TURSO_AUTH_TOKEN: "test-token",
      }),
    ).toThrow("REMOTE_DATABASE_NOT_CONFIGURED");
    expect(() =>
      remoteStorageConfig({
        TURSO_DATABASE_URL: "file:/tmp/db",
        TURSO_AUTH_TOKEN: "test-token",
      }),
    ).toThrow("REMOTE_DATABASE_NOT_CONFIGURED");
  });
  it("leaves unconfigured local development available", () => {
    expect(remoteStorageConfig({})).toBeUndefined();
    expect(remoteStorageConfig({ TURSO_DATABASE_URL: " " })).toBeUndefined();
  });
});
