import { orbitAPI } from "@/domains/api/orbit-api";
import type { paths } from "@orbit/api-types";
import {
  useQuery as useTanstackQuery,
  type UseQueryOptions as UseTanstackQueryOptions,
  type UseQueryResult as UseTanstackQueryResult,
  useMutation as useTanstackMutation,
  type UseMutationOptions as UseTanstackMutationOptions,
  type UseMutationResult as UseTanstackMutationResult,
} from "@tanstack/react-query";
import type { AxiosError } from "axios";

type TMethods = "get" | "post" | "put" | "delete" | "patch";

type TSuccessCodes = 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226;
type ToNumber<T> = T extends `${infer N extends number}` ? N : never;

type FilterKeys<Target extends object, Value> = {
  [K in keyof Target]-?: Target[K] extends Value ? K : never;
}[keyof Target];

type TPathsGet = Readonly<FilterKeys<paths, { get: unknown }>>;
type TPathsPatch = Readonly<FilterKeys<paths, { patch: unknown }>>;
type TPathsPost = Readonly<FilterKeys<paths, { post: unknown }>>;
type TPathsPut = Readonly<FilterKeys<paths, { put: unknown }>>;
type TPathsDelete = Readonly<FilterKeys<paths, { delete: unknown }>>;
type TAnyPath = TPathsGet | TPathsPatch | TPathsPost | TPathsPut | TPathsDelete;

export type NonNever<T, Fallback = unknown> = [T] extends [never]
  ? Fallback
  : T;

type TErrorStatusCodes<
  PathKey extends keyof paths,
  Method extends keyof paths[PathKey],
> = paths[PathKey][Method] extends { responses: infer R }
  ? Exclude<
      Extract<keyof R, number> | ToNumber<Extract<keyof R, `${number}`>>,
      TSuccessCodes
    >
  : never;

type TQueryArgs<E extends TAnyPath, Method extends TMethods> = {
  query?: NonNullable<paths[E][Method]>["parameters"]["query"];
} & (undefined extends NonNullable<paths[E][Method]>["parameters"]["path"]
  ? {} // if path is undefined, omit it
  : {
      pathParams: NonNullable<
        NonNullable<paths[E][Method]>["parameters"]["path"]
      >;
    }) &
  (undefined extends NonNullable<paths[E][Method]>["requestBody"]
    ? {} // if path is undefined, omit it
    : {
        body: NonNullable<
          NonNullable<paths[E][Method]>["requestBody"]
        >["content"]["application/json"];
      });

type TPathResponses<
  PathKey extends keyof paths,
  Method extends keyof paths[PathKey],
> = paths[PathKey][Method] extends { responses: infer R } ? R : never;

type TResponseJson<T> = T extends { content: { "application/json": infer R } }
  ? R
  : never;

type TPathData<
  PathKey extends keyof paths,
  Method extends keyof paths[PathKey],
  HTTPStatus extends number,
> = TResponseJson<
  // Prefer numeric keys, otherwise fall back to string-numeric keys
  HTTPStatus extends keyof TPathResponses<PathKey, Method>
    ? TPathResponses<PathKey, Method>[HTTPStatus]
    : `${HTTPStatus}` extends keyof TPathResponses<PathKey, Method>
      ? TPathResponses<PathKey, Method>[`${HTTPStatus}`]
      : never
>;

export type DefaultQueryError<
  TPath extends TPathsGet | TPathsPost | TPathsPut | TPathsDelete | TPathsPatch,
  Method extends keyof paths[TPath],
  ErrCodes extends number = TErrorStatusCodes<TPath, Method>,
> = AxiosError<NonNever<TPathData<TPath, Method, ErrCodes>, unknown>>;

function generateQueryKey<E extends TAnyPath, Method extends TMethods>(
  args: {
    endpoint: E;
  } & TQueryArgs<E, Method>
) {
  const { endpoint, ...rest } = args;

  return [endpoint, ...Object.values(rest)] as const;
}

function getFullEndpoint<E extends TAnyPath, Method extends TMethods>(
  args: {
    endpoint: E;
  } & TQueryArgs<E, Method>
) {
  let fullEndpoint: string = args.endpoint;

  if (!("pathParams" in args)) {
    return fullEndpoint;
  }

  for (const [key, value] of Object.entries(args.pathParams)) {
    fullEndpoint = fullEndpoint.replace(`{${key}}`, value);
  }
  return fullEndpoint;
}

export function createQueryHook<
  const Endpoint extends TAnyPath,
  const Method extends TMethods,
  Response extends TPathData<Endpoint, Method, TSuccessCodes>,
  Error extends DefaultQueryError<Endpoint, Method>,
>({ endpoint, method }: { endpoint: Endpoint; method: Method }) {
  function getQueryKey(args: TQueryArgs<Endpoint, Method>) {
    return generateQueryKey({ endpoint, ...args });
  }

  function useQuery(
    args: TQueryArgs<Endpoint, Method>,
    options?: Omit<
      UseTanstackQueryOptions<Response, Error, Response>,
      "queryKey" | "queryFn"
    >
  ): UseTanstackQueryResult<Response, Error> {
    const queryKey = getQueryKey(args);
    const fullEndpoint = getFullEndpoint({
      endpoint,
      ...args,
    });

    return useTanstackQuery<Response, Error, Response>({
      queryKey,
      queryFn: async () => {
        const response = await orbitAPI[method]<Response>(fullEndpoint, {
          params: args.query,
        });

        return response.data;
      },
      ...options,
    });
  }

  return {
    useQuery,
    getQueryKey,
  };
}

export function createMutationHook<
  const Endpoint extends TAnyPath,
  Method extends TMethods,
  Response extends TPathData<Endpoint, Method, TSuccessCodes>,
  Error extends DefaultQueryError<Endpoint, Method>,
>({ endpoint, method }: { endpoint: Endpoint; method: Method }) {
  function useMutation(
    options?: Omit<
      UseTanstackMutationOptions<
        Response,
        Error,
        TQueryArgs<Endpoint, Method>,
        Response
      >,
      "queryKey" | "queryFn"
    >
  ): UseTanstackMutationResult<
    Response,
    Error,
    TQueryArgs<Endpoint, Method>,
    Response
  > {
    return useTanstackMutation<
      Response,
      Error,
      TQueryArgs<Endpoint, Method>,
      Response
    >({
      mutationFn: async (args: TQueryArgs<Endpoint, Method>) => {
        const fullEndpoint = getFullEndpoint<Endpoint, Method>({
          endpoint,
          ...args,
        });

        const response = await orbitAPI[method]<Response>(fullEndpoint, {
          params: args.query,
          ...("body" in args ? { data: args.body } : {}),
        });

        return response.data;
      },
      ...options,
    });
  }

  return {
    useMutation,
  };
}
