export interface LoginItemSettings {
  openAtLogin: boolean;
  path: string;
  args?: string[];
}

export interface AutoLaunchSettings {
  openAtLogin: boolean;
  path: string;
  args: string[];
}

export interface AutoLaunchAppLike {
  getPath(name: "exe"): string;
  getLoginItemSettings?(): Partial<LoginItemSettings>;
  setLoginItemSettings(settings: LoginItemSettings): void;
}

export interface ConfigureAutoLaunchOptions {
  openAtLogin?: boolean;
  executablePath?: string;
  args?: string[];
}

export function configureAutoLaunch(
  app: AutoLaunchAppLike,
  options: ConfigureAutoLaunchOptions = {}
): LoginItemSettings {
  const settings = buildLoginItemSettings(app, options.openAtLogin ?? true, options);
  app.setLoginItemSettings(settings);
  return settings;
}

export function getAutoLaunchSettings(
  app: AutoLaunchAppLike,
  options: ConfigureAutoLaunchOptions = {}
): AutoLaunchSettings {
  const current = app.getLoginItemSettings?.() ?? {};
  const path = options.executablePath ?? current.path ?? app.getPath("exe");
  const args = options.args ?? current.args ?? [];

  return {
    openAtLogin: Boolean(current.openAtLogin),
    path,
    args: [...args]
  };
}

export function setAutoLaunchOpenAtLogin(
  app: AutoLaunchAppLike,
  openAtLogin: boolean,
  options: ConfigureAutoLaunchOptions = {}
): AutoLaunchSettings {
  const settings = buildLoginItemSettings(app, openAtLogin, options);
  app.setLoginItemSettings(settings);

  return {
    openAtLogin: settings.openAtLogin,
    path: settings.path,
    args: settings.args ? [...settings.args] : []
  };
}

function buildLoginItemSettings(
  app: AutoLaunchAppLike,
  openAtLogin: boolean,
  options: ConfigureAutoLaunchOptions
): LoginItemSettings {
  const settings: LoginItemSettings = {
    openAtLogin,
    path: options.executablePath ?? app.getPath("exe")
  };

  if (options.args && options.args.length > 0) {
    settings.args = [...options.args];
  }

  return settings;
}
