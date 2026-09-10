import { google } from 'googleapis';

export class GoogleAuthService {
    constructor() {
        // These need to be in .env
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI // e.g., http://localhost:3000/auth/google/callback
        );
    }

    /**
     * Generate the Google OAuth URL for the user to visit
     */
    getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.compose', // For creating drafts
            'https://www.googleapis.com/auth/calendar.events', // Least privilege: read/write events only, without full calendar admin
            'https://www.googleapis.com/auth/contacts.readonly' // Read-only access for contact dossier sync
        ];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline', // Required to get a refresh token
            prompt: 'consent', // Force consent screen to guarantee refresh_token on every login during dev
            scope: scopes
        });
    }

    /**
     * Revoke access/refresh token with Google OAuth2
     * @param {string} token 
     */
    async revokeToken(token) {
        if (!token) return;
        try {
            await this.oauth2Client.revokeToken(token);
        } catch (error) {
            console.warn('[GoogleAuthService] Token revocation warning:', error.message);
        }
    }

    /**
     * Exchange the authorization code for tokens and user profile
     * @param {string} code 
     */
    async handleCallback(code) {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({
            auth: this.oauth2Client,
            version: 'v2'
        });

        const userInfo = await oauth2.userinfo.get();
        
        return {
            tokens,
            profile: userInfo.data
        };
    }
}

export default new GoogleAuthService();
