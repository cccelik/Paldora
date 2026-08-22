declare const brand: unique symbol;
export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type UserId = Brand<string, 'UserId'>;
export type BoxId = Brand<string, 'BoxId'>;
export type PostId = Brand<string, 'PostId'>;

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}
