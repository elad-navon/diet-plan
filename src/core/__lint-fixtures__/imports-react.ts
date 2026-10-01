// Fixture: must trigger no-restricted-imports (core must not import React).
import { useState } from 'react';

export const hook = useState;
