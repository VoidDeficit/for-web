import { Navigator, useLocation } from "@solidjs/router";
import { Accessor, createMemo } from "solid-js";

import { CONFIGURATION } from "@revolt/common";
import { AppConfig, STOAT_HOST } from "@revolt/common/lib/env";
import { Client, UserLimits } from "stoat.js";

import { DefaultHost, StoatOrigin } from ".";

const R_RelPath = /^\/i\/[^/]+/;

export default class Instance {
  readonly host?: string;
  readonly origin: string;
  readonly isStoat: boolean;
  readonly #base;
  readonly #nav;

  readonly apiUrl: string;
  readonly wsUrl: string;
  readonly mediaUrl: string;
  readonly proxyUrl: string;
  readonly gifboxUrl: string;
  readonly captchaKey: string;

  #firstInit = true;
  readonly client!: Client;
  readonly globalLimits;
  readonly baseLimits;

  /** Current enforced limits based on user type */
  readonly limits: Accessor<UserLimits>;

  constructor(appCfg: AppConfig, cli: Client, host: string, nav: Navigator) {
    const apiCfg = (this.client = cli).configuration!;

    //Endpoints
    this.apiUrl = appCfg.api;
    this.wsUrl = apiCfg.ws;
    this.mediaUrl = apiCfg.features.autumn.url;
    this.proxyUrl = apiCfg.features.january.url;
    this.gifboxUrl = "https://api.gifbox.me"; //TODO Gifbox URL from backend

    //Features
    this.captchaKey = CONFIGURATION.HCAPTCHA_SITEKEY; //TODO Detect from API
    this.globalLimits = apiCfg.features.limits.global;
    this.baseLimits = apiCfg.features.limits.new_user;
    this.limits = createMemo(() => this.client.limits ?? this.baseLimits);

    this.host = host || undefined;
    if (!host) host = DefaultHost;

    const hostUrl = new URL(`https://${host}`);
    this.origin = hostUrl.origin;
    this.isStoat = host === STOAT_HOST;
    this.#base = this.isStoat ? "" : `/i/${host}`;
    this.#nav = nav;
  }

  /** Prepend a relative path with instance base URL
   * @param pathOnly Get only the path component and not URL
   * @param base Defaults to the base path of this instance
   */
  href = (path: string, pathOnly?: boolean, base?: string) =>
    (pathOnly ? "" : StoatOrigin) + (base ? `/i/${base}` : this.#base) + path;

  /** Convert path to relative form, stripping instance prefix (if any)
   * @param path Defaults to `location.pathname`
   */
  static relPath = (path?: string) =>
    (path ?? useLocation().pathname).replace(R_RelPath, "");

  /** Switch to a new instance and redirect the client */
  switchTo = (host: string) =>
    this.#nav(this.href(Instance.relPath(), true, host));

  /** Create a new Stoat.js client, disposing the old one */
  newClient() {
    if (this.#firstInit) {
      this.#firstInit = false;
      return this.client;
    }

    this.client.events.removeAllListeners();
    this.client.removeAllListeners();
    this.client.events.disconnect();

    //@ts-expect-error readonly
    return (this.client = _newClient(this.apiUrl));
  }
}

export function _newClient(apiUrl: string) {
  return new Client({
    baseURL: apiUrl,
    autoReconnect: false,
    syncUnreads: true,
    debug: import.meta.env.DEV,
  });
}
