const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');
const cors = require('cors'); // Adicionado para evitar erro de bloqueio no navegador

const app = express();
app.use(express.json());
app.use(cors()); // Permite que o front fale com o back sem travar
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO ---
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741".trim();
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ BANCO CONECTADO"))
    .catch(err => console.log("❌ ERRO BANCO:", err));

// MODELS
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    email: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    ganhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

const Saque = mongoose.model('Saque', new mongoose.Schema({
    user: String, valor: Number, chavePix: String, status: { type: String, default: 'Pendente' }, data: { type: Date, default: Date.now }
}));

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/auth/register', async (req, res) => {
    try {
        const { user, pass, email } = req.body;
        const exists = await User.findOne({ $or: [{ user }, { email }] });
        if (exists) return res.json({ success: false, message: "Usuário/Email já existe" });
        const novo = await User.create({ user, pass, email });
        res.json({ success: true, user: novo.user, saldo: 0, ganhos: 0 });
    } catch (e) { res.json({ success: false, message: "Erro no servidor" }); }
});

app.post('/auth/login', async (req, res) => {
    try {
        const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
        if (c) res.json({ success: true, user: c.user, saldo: c.saldo, ganhos: c.ganhos });
        else res.json({ success: false, message: "Dados incorretos" });
    } catch(e) { res.json({ success: false }); }
});

// --- GERAÇÃO DE PIX (MERCADO PAGO) ---
app.post('/gerar-pix', (req, res) => {
    const { valor, userLogado } = req.body;
    
    // Nome limpo para o email fake do MP
    const cleanUser = String(userLogado).replace(/[^a-zA-Z0-9]/g, '');

    const postData = JSON.stringify({
        transaction_amount: Number(valor),
        description: `Deposito_${cleanUser}`,
        payment_method_id: "pix",
        payer: {
            email: `${cleanUser}@gmail.com`,
            first_name: cleanUser,
            last_name: "User",
            identification: { type: "CPF", number: "19119119100" } // CPF genérico necessário para algumas APIs
        }
    });

    const options = {
        hostname: 'api.mercadopago.com',
        path: '/v1/payments',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MP_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': 'key_' + Date.now()
        }
    };

    const mpReq = https.request(options, (mpRes) => {
        let chunks = [];
        mpRes.on('data', d => chunks.push(d));
        mpRes.on('end', () => {
            const data = Buffer.concat(chunks).toString();
            try {
                const response = JSON.parse(data);
                if (response.point_of_interaction) {
                    res.json({
                        success: true,
                        imagem_qr: response.point_of_interaction.transaction_data.qr_code_base64,
                        copia_e_cola: response.point_of_interaction.transaction_data.qr_code
                    });
                } else {
                    console.log("Erro MP:", response);
                    res.json({ success: false, message: response.message || "Erro no MP" });
                }
            } catch (e) {
                res.json({ success: false, message: "Erro ao processar resposta" });
            }
        });
    });

    mpReq.on('error', (e) => res.json({ success: false, message: "Erro de conexão" }));
    mpReq.write(postData);
    mpReq.end();
});

// --- OUTRAS APIS ---
app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(!u) return res.json({ success: false });
    let menor = Math.min(...u.bets), cores = [];
    u.bets.forEach((v, i) => { if(v === menor) cores.push(i); });
    const alvo = cores[Math.floor(Math.random() * cores.length)];
    const ganho = u.bets[alvo] * 5;
    const nS = Number((u.saldo + ganho).toFixed(2));
    const nG = Number((u.ganhos + ganho).toFixed(2));
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: nS, ganhos: nG, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, novoGanhos: nG });
});

let t = 120; setInterval(() => { if(t > 0) t--; else t = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Servidor Rodando!"));
