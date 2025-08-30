import functools
import inspect
from typing import Any, Callable


def handle_error(x: Any) -> Any:
    if isinstance(x, dict) and 'error' in x:
        raise RuntimeError(x['error'])
    return x


def api_method(name: str,
               opts: bool = False,
               timeout_seconds: bool = False) -> Callable:
    """
    Decorator for CoCalcAPI methods.
    Converts arguments (excluding self) into a dict, removes None values,
    and calls parent.call(name, [args_dict]).

        name (str): of the api call
        opts (bool): if given, structure arg_dict with all the explicit user-provided options under a field "opts".
        timeout_seconds (bool): if given and user input has a timeout field, assume it is in seconds and make the api
            call have the corresponding timeout.
      
    """

    def decorator(func: Callable) -> Callable:
        sig = inspect.signature(func)

        @functools.wraps(func)
        def wrapper(self, *args, **kwargs) -> Any:
            # Bind args/kwargs to parameter names
            bound = sig.bind(self, *args, **kwargs)
            bound.apply_defaults()
            args_dict = {
                k: v
                for k, v in bound.arguments.items()
                if k != "self" and v is not None
            }
            if timeout_seconds and 'timeout' in args_dict:
                timeout = 1000 * args_dict['timeout']
            else:
                timeout = None
            if opts:
                args_dict = {'opts': args_dict}
            return self._parent.call(name, [args_dict], timeout=timeout)

        return wrapper

    return decorator
