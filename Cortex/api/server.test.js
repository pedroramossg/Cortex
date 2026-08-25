import request from "supertest";
import app from "./server";

describe('Server Initialization', () => {
    it('should return a 200 OK at the /health endpoint', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'OK' });
    });
});