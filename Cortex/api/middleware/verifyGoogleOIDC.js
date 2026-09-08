import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();

export const verifyGoogleOIDC = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Missing Authorization header' });
        }

        const token = authHeader.split(' ')[1];

        // Google Pub/Sub sends an OIDC token. We verify its signature against Google's public JWKS.
        // We also check the audience (which should be the URL of this endpoint, or a custom audience configured in GCP).
        // Since we might not know the exact audience yet, we skip audience verification or set it to process.env.WEBHOOK_AUDIENCE.
        const audience = process.env.WEBHOOK_AUDIENCE || `https://${req.get('host')}${req.originalUrl}`;
        
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: audience,
        });

        const payload = ticket.getPayload();
        
        // Ensure the token was issued by Google
        if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
            return res.status(401).json({ success: false, message: 'Invalid token issuer' });
        }

        // Attach payload just in case it's needed
        req.oidcPayload = payload;

        next();
    } catch (error) {
        console.error('Google OIDC Verification failed:', error.message);
        return res.status(401).json({ success: false, message: 'Invalid or expired OIDC token' });
    }
};
