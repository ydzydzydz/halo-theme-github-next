/**
 * 当前登录用户的信息。
 *
 * 顶栏用户菜单与通知红点都要用到「当前是谁」，两处共用同一份请求，
 * 避免同页发两次控制台接口。
 */

export type CurrentUserDetail = {
  user?: {
    metadata?: {
      name?: string;
    };
    spec?: {
      avatar?: string;
      displayName?: string;
    };
  };
};

const currentUserEndpoint = "/apis/api.console.halo.run/v1alpha1/users/-";

let currentUserRequest: Promise<CurrentUserDetail | undefined> | undefined;

/** 取当前登录用户；未登录或请求失败时返回 undefined。 */
export const getCurrentUser = () => {
  currentUserRequest ??= fetch(currentUserEndpoint)
    .then((response) => (response.ok ? (response.json() as Promise<CurrentUserDetail>) : undefined))
    .catch(() => undefined);

  return currentUserRequest;
};

/**
 * 登录态由服务端在 <body data-authenticated> 上给出，
 * 未登录时就不必再请求控制台接口去反查当前用户。
 */
export const isAuthenticated = () => document.body?.dataset.authenticated === "true";

/** 取当前登录用户名；未登录时返回 undefined。 */
export const getCurrentUsername = async () => {
  const currentUser = await getCurrentUser();
  const name = currentUser?.user?.metadata?.name;

  if (!name || name === "anonymousUser") {
    return undefined;
  }

  return name;
};
