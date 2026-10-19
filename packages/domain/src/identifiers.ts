declare const brand: unique symbol;

/**
 * A nominal string type. Branding prevents passing, for example, a Box ID
 * where a user ID is expected, while remaining a plain string on the wire.
 */
export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

/** Internal Paldora user ID. Never the identity provider's subject. */
export type UserId = Brand<string, 'UserId'>;

export type MediaAssetId = Brand<string, 'MediaAssetId'>;

export type BoxId = Brand<string, 'BoxId'>;
export type BoxInvitationId = Brand<string, 'BoxInvitationId'>;
export type FriendshipId = Brand<string, 'FriendshipId'>;
