class LLMSuiteError(Exception):
    pass


class LLMSuiteAuthError(LLMSuiteError):
    pass


class LLMSuiteTimeoutError(LLMSuiteError):
    pass


class LLMSuiteBlankResponseError(LLMSuiteError):
    pass


class LLMSuiteInvalidJSONError(LLMSuiteError):
    pass


class LLMSuiteSchemaValidationError(LLMSuiteError):
    pass


class LLMSuiteDeploymentError(LLMSuiteError):
    pass


class LLMSuiteProviderChangedError(LLMSuiteError):
    pass

