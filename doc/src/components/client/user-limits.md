# User Limits

Many interactions a user can have with Stoat are limited by the backend. Any action that has a backend limit should have a matching limit in for-web.

## Using Limits

To use the limits for the logged in user, call `.getLimits()` on the client. This returns a limits object that has all backend limits that apply to the logged in user, and it takes into account if the user is new, or in the future, any other type of user that has different limits.

Limits can only be accessed by the client, which can only be accessed inside a solid component. If access to the limits is needed outside a solid component, the limits must be passed as function parameters.

When using limits, safeguard for them to be undefined or for the client to be unconfigured. The following is an example of fully safeguarded limit usage:

```typescript
import { createEffect } from "solid-js";
import { useClient } from "@revolt/client";

export function ExampleComponent() {
  const client = useClient();

  const maxMessageLength = () => {
    const cl = client();
    // The configured signal returns whether the client has been configured. Configuring is asynchronous so it may not happen for a few milliseconds after the client is initially created in the client lifecycle. If the client is not configured, return the default defined in the Stoat limits config in the stoatchat repo.
    if (!cl.configured()) return 2000;
    // getLimits returns the limits object for the logged in user, taking into account their user type. It may return undefined if the client is unconfigured.
    // The message_length limit is present on the limits object. The ?? 2000 safeguard is for if getLimits() returns undefined. Use the defaults defined in the Stoat limits config in the stoatchat repo.
    return cl.getLimits()?.message_length ?? 2000;
  };

  createEffect(() => {
    // If the client has not yet been initialized (ie. lifecycle has not fully executed) this will print 2000, then the actual limit.
    // If the client has been initialized already this will print the actual limit once.
    console.log(maxMessageLength());
  });
}
```
