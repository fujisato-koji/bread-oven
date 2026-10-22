"""焼く日の熱の模型（tools/gen_thermal.py が使う）。

設計の計算に使った熱の模型を、numpy を使わない素の Python に写したものである。
式、格子、刻み、置いた値は元の模型と同じにし、計算の順も元の配列の演算の順に合わせた。
元の模型は次のとおりで、どれも書き換えていない。

- 1 次元：oven_rt.py（層の格子、内と外の熱伝達）、light_ovens.py（形 A のドームと炉床、パンの下の分け方）、
  drum_cases_rt.py（焚き口の面積）、fire_sim.py（焚き方と焼き方の手順）、nb_fire.py と common.py（日の型と条件）。
- 2 次元：f2_hearth2d.py（炉床を切らない四角を、同じ面積の円に置き換えた軸対称の 2 次元。縄 6 mm の基本の形）。
  3 回目のあとも同じ式で 60 分回すところだけを足した（元は 3 回目を入れて 1 分で止める）。

numpy の元の模型との差は、gen_thermal.py が書き出す刻みで 0.01 K 未満であることを確かめた（2026-10-22）。
単位は J、W、s、m、℃である。
"""

import math

SIG = 5.670e-8

# ---------------------------------------------------------------- 物性（oven_rt.py、light_ovens.py）

# 毛布（Superwool Plus 128 kg/m3 の値、仮）。0〜800℃の折れ線で、外は端の値（np.interp と同じ）
SW_PTS = ((0.0, 0.035), (200.0, 0.05), (400.0, 0.08), (600.0, 0.12), (800.0, 0.18))
PERL_K = 0.105  # パーライトとセメント 1:5（P55）
STEAM = 0.050  # 1 回ごとの蒸気の水 kg（common.py）
U_OPEN = 30.0  # 入れるときと出すときに開けた口の熱の通りやすさ W/(m2 K)（common.py、仮）

# 日の条件（common.py の MID と WORST）
MID = dict(Ta=10.0, hc=8.0, kf=1.1, kc=0.9, qd=0.50e6)
WORST = dict(Ta=-10.0, hc=15.0, kf=1.0, kc=0.8, qd=0.63e6)


def k_sw(T):
    """毛布の熱伝導率（np.interp と同じ式の順）。"""
    if T <= SW_PTS[0][0]:
        return SW_PTS[0][1]
    for (x0, y0), (x1, y1) in zip(SW_PTS, SW_PTS[1:]):
        if T < x1:
            return (y1 - y0) / (x1 - x0) * (T - x0) + y0
    return SW_PTS[-1][1]


def mat(k, rho, c):
    """k は数（一定）か関数（温度による）。"""
    return dict(k=k, rho=rho, c=c)


def mats(kf, kc):
    return dict(brick=mat(kf, 2000.0, 960.0), cast=mat(kc, 1800.0, 1000.0), sw=mat(k_sw, 128.0, 1000.0),
                perl=mat(PERL_K, 500.0, 900.0))


def h_out(Ts, Ta, hc, eps=0.9):
    a, b = Ts + 273.15, Ta + 273.15
    return hc + eps * SIG * (a * a + b * b) * (a + b)


def h_in(T, eps=0.85):
    a = T + 273.15
    return 4 * eps * SIG * a ** 3 + 4.0


# ---------------------------------------------------------------- 焚き口の形（drum_cases_rt.py、light_ovens.door_for）

def door_fits(w_d, h_d, D=0.27, h=0.12, margin=0.02):
    half = w_d / 2
    if half < D / 2 + margin:
        return False
    f = min(half, h_d * 0.5)
    hj = h_d - f
    Ra = (half * half + f * f) / (2 * f)
    for i in range(0, 101):
        x = (D / 2) * i / 100
        need = h * math.sqrt(max(0.0, 1 - (x / (D / 2)) ** 2)) + margin
        ydoor = hj + math.sqrt(Ra * Ra - x * x) - (Ra - f)
        if ydoor < need:
            return False
    return True


def door_area(w_d, h_d):
    half = w_d / 2
    f = min(half, h_d * 0.5)
    hj = h_d - f
    Ra = (half * half + f * f) / (2 * f)
    th = 2 * math.asin(half / Ra)
    seg = 0.5 * Ra * Ra * (th - math.sin(th))
    return w_d * hj + seg


def door_for(H, w_d=0.32):
    h = round(0.60 * H, 3)
    hmin = next(x / 1000 for x in range(100, 400) if door_fits(w_d, x / 1000))
    h = max(h, hmin)
    return w_d, h, door_area(w_d, h)


# ---------------------------------------------------------------- 層の壁（oven_rt.Comp）

class Comp:
    """層を重ねた 1 次元の壁。面積は深さで変わる（球は半径の 2 乗、box は内と外のあいだを直線）。"""

    def __init__(self, name, layers, shape, A_in, A_out=None, r_in=None, n_per_m=200):
        self.name = name
        self.x, self.dx, self.m = [], [], []
        xs = 0.0
        for t, mt in layers:
            n = max(2, int(round(t * n_per_m)))
            d = t / n
            for i in range(n):
                self.x.append(xs + (i + 0.5) * d)
                self.dx.append(d)
                self.m.append(mt)
            xs += t
        self.L = xs
        self.shape = shape
        self.A_in, self.A_out, self.r_in = A_in, A_out, r_in
        self.N = len(self.x)
        self.setup()

    def area(self, x):
        if self.shape == 'sphere':
            r = self.r_in + x
            return self.A_in * (r / self.r_in) ** 2
        return self.A_in + (self.A_out - self.A_in) * x / self.L

    def setup(self):
        self.vol = [self.area(xc) * d for xc, d in zip(self.x, self.dx)]
        self.faceA = []
        self.xface = []
        xf = 0.0
        for d in self.dx[:-1]:
            xf += d
            self.xface.append(xf)
            self.faceA.append(self.area(xf))
        self.Aout = self.area(self.L)
        self.cap = [mm['rho'] * mm['c'] * v for mm, v in zip(self.m, self.vol)]
        self.half = [d / 2 for d in self.dx]
        self.kf = [mm['k'] for mm in self.m]

    def ks(self, T):
        return [k(t) if callable(k) else k for k, t in zip(self.kf, T)]

    def scaled(self, name, f):
        """面積だけを f 倍した写し（light_ovens.split）。"""
        c = Comp.__new__(Comp)
        c.__dict__.update(self.__dict__)
        c.name = name
        c.A_in = self.A_in * f
        c.A_out = self.A_out * f
        c.setup()
        return c


# ---------------------------------------------------------------- 形 A（light_ovens.dome、nb_fire.make）

R_IN = 0.30  # ドームの内の半径
T_CAST = 0.040  # キャスタブル
T_BL = 0.075  # 毛布
T_BRICK = 0.065  # 炉床のレンガ
T_PERL = 0.075  # 炉床の下のパーライトとセメント
LOAF_D = 0.25  # 1 kg のパンの径
N_LOAF = 2
LEAK = 0.5  # 継ぎ目の漏れ W/K（仮）


def make_oven(cond, leak=LEAK):
    """炉床（パンの下）、ドーム、炉床（空いた所）の 3 つの壁と、閉じた扉の熱の通りやすさ。"""
    M = mats(cond['kf'], cond['kc'])
    r = R_IN
    w_d, h_d, Ad = door_for(r)
    R_h = r + T_CAST + T_BL
    hearth = Comp('hearth', [(T_BRICK, M['brick']), (T_PERL, M['perl'])], 'box', A_in=math.pi * r * r, A_out=math.pi * R_h * R_h)
    dome = Comp('dome', [(T_CAST, M['cast']), (T_BL, M['sw'])], 'sphere', A_in=2 * math.pi * r * r, r_in=r)
    Ah = math.pi * r * r
    f_spot = min(0.95, N_LOAF * math.pi * (LOAF_D / 2) ** 2 / Ah)
    h_loaf = hearth.scaled('hearth', f_spot)
    h_open = hearth.scaled('hearth_open', 1 - f_spot)
    door_U = 6.0 + leak / Ad
    return dict(comps=[h_loaf, dome, h_open], door_U=door_U, door_A=Ad, f_spot=f_spot, door=(w_d, h_d))


# ---------------------------------------------------------------- 焚き方と焼き方（fire_sim.State、fire_phase、post_fire）

class State:
    def __init__(self, oven, Ta, hc, eps_out=0.9):
        self.oven = oven
        self.comps = oven['comps']
        self.T = [[float(Ta)] * c.N for c in self.comps]
        self.face = [float(Ta)] * len(self.comps)
        self.Ta, self.hc, self.eps_out = float(Ta), hc, eps_out
        self.t = 0.0
        self.loads = []
        names = [c.name for c in self.comps]
        self.ih = names.index('hearth')
        self.iho = names.index('hearth_open')
        self.ic = names.index('dome')
        self.door_UA = oven['door_U'] * oven['door_A']
        self.E = dict(fire=0.0, refire=0.0)
        self.Ts_max = dict(dome=-1e9, hearth=-1e9)
        self.Tn = None  # 窯の中の空気（閉じているときだけ）
        self.mode = 'fire'
        self.log = []  # 毎分の状態
        self.log_every = 60.0

    def hearth(self):
        return self.T[self.ih][0]

    def havg(self):
        a, b = self.comps[self.ih], self.comps[self.iho]
        return (self.T[self.ih][0] * a.A_in + self.T[self.iho][0] * b.A_in) / (a.A_in + b.A_in)

    def ceil(self):
        return self.T[self.ic][0]

    def step(self, dt, fire=None, extraUA=0.0, Qload=0.0, tau=900.0, f_h=0.5, tag='fire'):
        comps, T = self.comps, self.T
        ks = [c.ks(Tc) for c, Tc in zip(comps, T)]
        rate = 0.0
        for ts in self.loads:
            if self.t >= ts:
                rate += Qload / tau * math.exp(-(self.t - ts) / tau)
        q_d_hearth = f_h * rate
        q_d_node = (1 - f_h) * rate
        Tn = None
        if fire is not None:
            Tt, r = fire['T_top'], fire['rate_Kph']
            G = [k[0] * c.A_in / (c.dx[0] / 2) for c, k in zip(comps, ks)]
            T0 = [Tc[0] for Tc in T]
            if r is None:
                Tset = [Tt] * len(comps)
            else:
                Tset = [min(Tt, f + r * dt / 3600.0) for f in self.face]
            qi = [max(0.0, g * (s - t0)) for g, s, t0 in zip(G, Tset, T0)]
            tot = 0.0
            for q in qi:
                tot += q
            self.face = [t0 + 1.0 * (s - t0) if q > 0 else max(t0, min(f, s))
                         for q, t0, s, f in zip(qi, T0, Tset, self.face)]
            self.E[tag] += tot * dt
        else:
            dUA = self.door_UA + extraUA
            num = dUA * self.Ta - q_d_node
            den = dUA
            for c, Tc in zip(comps, T):
                h = h_in(Tc[0])
                num += h * c.A_in * Tc[0]
                den += h * c.A_in
            Tn = num / den
        for i, (c, Tc, k) in enumerate(zip(comps, T, ks)):
            N = c.N
            Q = [0.0] * N
            if fire is not None:
                Q[0] += qi[i]
            else:
                Q[0] += h_in(Tc[0]) * c.A_in * (Tn - Tc[0])
                if i == self.ih:
                    Q[0] -= q_d_hearth
            hf = c.half
            q = [fa * (Tc[j] - Tc[j + 1]) / (hf[j] / k[j] + hf[j + 1] / k[j + 1])
                 for j, fa in enumerate(c.faceA)]
            for j in range(N - 1):
                Q[j] -= q[j]
            for j in range(N - 1):
                Q[j + 1] += q[j]
            ho = h_out(Tc[-1], self.Ta, self.hc, self.eps_out)
            Rtot = hf[-1] / k[-1] + 1.0 / ho
            qo = c.Aout * (Tc[-1] - self.Ta) / Rtot
            Ts = self.Ta + (Tc[-1] - self.Ta) / (ho * Rtot)
            key = 'hearth' if c.name.startswith('hearth') else 'dome'
            if Ts > self.Ts_max[key]:
                self.Ts_max[key] = Ts
            Q[-1] -= qo
            T[i] = [a + b * dt / cc for a, b, cc in zip(Tc, Q, c.cap)]
        if fire is None:
            self.face = [Tc[0] for Tc in T]
        self.t += dt
        self.Tn = Tn
        if self.t % self.log_every == 0.0:
            self.log.append(dict(t=self.t, mode=self.mode, Tn=Tn, face=list(self.face), T=[list(x) for x in T]))

    # 壁の中の面の温度（格子の境）と、外の面の温度
    def profile(self, i, T=None, face=None):
        """壁 i の、内面、格子の境、外面の温度（内から外へ）。内面は焚く間は保った温度、閉じているときは内の格子の温度。"""
        c = self.comps[i]
        Tc = self.T[i] if T is None else T
        f = self.face[i] if face is None else face
        k = c.ks(Tc)
        hf = c.half
        out = [f]
        for j in range(c.N - 1):
            R1 = hf[j] / k[j]
            R = R1 + hf[j + 1] / k[j + 1]
            out.append(Tc[j] - (Tc[j] - Tc[j + 1]) * R1 / R)
        ho = h_out(Tc[-1], self.Ta, self.hc, self.eps_out)
        Rtot = hf[-1] / k[-1] + 1.0 / ho
        out.append(self.Ta + (Tc[-1] - self.Ta) / (ho * Rtot))
        return out


def fire_phase(st, dur_h, T_top, rate_Kph, dt, tag='fire'):
    fire = dict(T_top=T_top, rate_Kph=rate_Kph)
    n = int(round(dur_h * 3600 / dt))
    for _ in range(n):
        st.step(dt, fire=fire, tag=tag)


def post_fire(st, dt, n_loads, dough_kg, q_dough, *, refire, U_open=U_OPEN, t_open=120.0, t_out_min=45.0, steam_kg=STEAM,
              t_soak_min=20.0, T_load_max=300.0, wait_max_min=60.0, refire_at=(3,), refire_thr=250.0, tau_min=15.0, f_h=0.5,
              T_load1_max=320.0, t_max_h=40.0):
    """焚き終えたあと（fire_sim.post_fire。扉の段は使わない、閉じたまま）。"""
    Qload = dough_kg * q_dough + steam_kg * 2.6e6
    tau = tau_min * 60.0
    Ad = st.oven['door_A']
    rec = dict(loads=[], refires=0, wait_exceeded=False)
    t_fire_end = st.t
    phase = 'wait'
    st.mode = 'soak1'
    next_t = None
    t_stop = None
    while True:
        if st.t > t_max_h * 3600:
            rec['timeout'] = True
            break
        if t_stop is not None and st.t >= t_stop - 1e-9:
            break
        if phase == 'bake' and next_t is not None and abs(st.t - next_t) < dt / 2:
            k = len(st.loads) + 1
            Th = st.hearth()
            if refire is not None and k in refire_at and Th < refire_thr:
                rec['refires'] += 1
                rec['t_refire_start'] = st.t
                rec['h_before_refire'] = Th
                st.mode = 'refire'
                fire_phase(st, refire['t_h'], refire['T_top'], refire['rate_Kph'], dt, tag='refire')
                rec['t_refire_end'] = st.t
                t_fire_end = st.t
                phase = 'wait_refire'
                st.mode = 'soak2'
                next_t = None
                continue
            st.loads.append(st.t)
            next_t = st.t + 3600.0 if len(st.loads) < n_loads else None
            rec['loads'].append(dict(k=k, t_s=st.t, after_refire=False, hearth=Th, havg=st.havg(), ceil=st.ceil()))
            st.mode = 'bake%d' % k
        extraUA = 0.0
        for ts in st.loads:
            for t0 in (ts, ts + t_out_min * 60.0):
                if t0 <= st.t < t0 + t_open:
                    extraUA = max(extraUA, U_open * Ad)
        st.step(dt, fire=None, extraUA=extraUA, Qload=Qload, tau=tau, f_h=f_h)
        if phase in ('wait', 'wait_refire'):
            since = (st.t - t_fire_end) / 60.0
            if wait_max_min is not None and phase == 'wait' and since > wait_max_min and st.hearth() > T_load_max:
                rec['wait_exceeded'] = True
                break
            Tlim = T_load1_max if (T_load1_max is not None and phase == 'wait') else T_load_max
            if since >= t_soak_min and st.hearth() <= Tlim:
                k = len(st.loads) + 1
                if k == 1:
                    rec['wait_min'] = since
                st.loads.append(st.t)
                rec['loads'].append(dict(k=k, t_s=st.t, after_refire=(phase == 'wait_refire'), hearth=st.hearth(),
                                         havg=st.havg(), ceil=st.ceil(), wait_min=since))
                phase = 'bake'
                st.mode = 'bake%d' % k
                next_t = st.t + 3600.0 if len(st.loads) < n_loads else None
        for L in rec['loads']:
            tb = st.t - L['t_s']
            if 0 < tb <= 3600 + dt / 2:
                L['ceil_min60'] = min(L.get('ceil_min60', 1e9), st.ceil())
            for mm in (15, 30, 45, 60):
                key = 'ceil_%d' % mm
                if key not in L and tb >= mm * 60 - 1e-6:
                    L[key] = st.ceil()
        if len(st.loads) == n_loads and t_stop is None:
            t_stop = st.loads[-1] + 3600.0 + dt
    rec['t_end'] = st.t
    rec['Qload'] = Qload
    rec['Ts_max'] = dict(st.Ts_max)
    rec['E_MJ'] = (st.E['fire'] + st.E['refire']) / 1e6
    return rec


DAYS = dict(
    normal=dict(label='ふつうの日', cond=MID, tf=4.0, tref=0.75, rate=100.0),
    cold=dict(label='寒い日', cond=WORST, tf=4.75, tref=1.0, rate=90.0),
)
T_TOP = 380.0


def run_day(name, dt=4.0, t_cool_h=48.0):
    """焼く日の 1 日（6:00 に火を付けてから t_cool_h 時間）。焼き終わりのあとも扉を閉めたまま冷ます。"""
    d = DAYS[name]
    cond = d['cond']
    oven = make_oven(cond)
    st = State(oven, cond['Ta'], cond['hc'])
    st.mode = 'fire'
    fire_phase(st, d['tf'], T_TOP, d['rate'], dt)
    t_fire_end = st.t
    rec = post_fire(st, dt, 3, 2.0, cond['qd'], refire=dict(T_top=T_TOP, t_h=d['tref'], rate_Kph=d['rate']))
    rec['t_fire_end'] = t_fire_end
    st.mode = 'cool'
    while st.t < t_cool_h * 3600 - 1e-6:
        st.step(dt, fire=None, extraUA=0.0, Qload=rec['Qload'], tau=900.0, f_h=0.5)
    return st, rec


# ---------------------------------------------------------------- 2 次元の炉床（f2_hearth2d.run、四角、縄 6 mm）

R_BRICK = 0.3874  # 四角の炉床と同じ面積の円の半径（f2_hearth2d の基本）
SEAT_R = 0.006 / 0.08  # ドームの足の下の縄 6 mm、0.08 W/(m K)（仮）


def run_2d(name, dt=4.0, t_after=3600.0, keep=None):
    """炉床の (r, z) の場とドームの 1 次元を、焚いてから 3 回目のあと t_after 秒まで回す。
    keep(t, phase, loads, rec) が名を返す刻み（段の移りを済ませたあと）の場を、その名で残す。"""
    d = DAYS[name]
    cond = d['cond']
    kf, kc, Ta, hc, qd = cond['kf'], cond['kc'], cond['Ta'], cond['hc'], cond['qd']
    t_fire, rate, tref = d['tf'], d['rate'], d['tref']
    T_top = T_TOP
    M = mats(kf, kc)
    r_in = R_IN
    dome = Comp('dome', [(T_CAST, M['cast']), (T_BL, M['sw'])], 'sphere', A_in=2 * math.pi * r_in ** 2, r_in=r_in)
    dT = [float(Ta)] * dome.N
    w_d, h_d, Ad = door_for(0.30)
    door_UA = 6.0 * Ad + LEAK
    Rb = math.sqrt(0.6606 / math.pi)
    dr = 0.003
    nr = int(round(Rb / dr))
    step_r = Rb / nr
    rf = [i * step_r for i in range(nr)] + [Rb]
    rc = [0.5 * (a + b) for a, b in zip(rf[:-1], rf[1:])]
    nzb, dz_b, nzp, dz_p = 13, 0.005, 10, 0.0075
    dz = [dz_b] * nzb + [dz_p] * nzp
    nz = len(dz)
    kP = PERL_K
    r_h = R_BRICK
    brick = [x < r_h for x in rc]
    inside = [x < min(r_h, 0.300) for x in rc]
    void = [x >= 0.415 for x in rc]
    k = [[kP] * nr for _ in range(nz)]
    rhoc = [[500 * 900.0] * nr for _ in range(nz)]
    for j in range(nzb):
        for i in range(nr):
            if brick[i]:
                k[j][i] = kf
                rhoc[j][i] = 2000 * 960
            if void[i]:
                k[j][i] = 1e-4
                rhoc[j][i] = 1e3
    Atop = [math.pi * (b ** 2 - a ** 2) for a, b in zip(rf[:-1], rf[1:])]
    C = [[rhoc[j][i] * (dz[j] * Atop[i]) for i in range(nr)] for j in range(nz)]
    dtC = [[dt / c for c in row] for row in C]
    T = [[float(Ta)] * nr for _ in range(nz)]
    loaf = [0.084 <= x < 0.196 for x in rc]
    A_loaf = sum(a for a, f in zip(Atop, loaf) if f)
    foot = [0.300 <= x < 0.340 for x in rc]
    blk = [0.340 <= x < 0.415 for x in rc]
    Gr = [[(2 * math.pi * rf[i + 1] * dz[j]) / (dr / 2 / k[j][i] + dr / 2 / k[j][i + 1]) for i in range(nr - 1)] for j in range(nz)]
    Gz = [[Atop[i] / (dz[j] / 2 / k[j][i] + dz[j + 1] / 2 / k[j + 1][i]) for i in range(nr)] for j in range(nz - 1)]
    U_bl = 1.0 / (0.075 / 0.07 + 1.0 / 12.0)
    Aedge = [2 * math.pi * Rb * x for x in dz]
    Qload = 2.0 * qd + STEAM * 2.6e6
    tau = 900.0
    # 上の面の決まった係数
    Gh = [k[0][i] * Atop[i] / (dz[0] / 2) for i in range(nr)]
    foot_c = [(Atop[i] / (0.020 / kc + SEAT_R + dz[0] / 2 / k[0][i])) if foot[i] else 0.0 for i in range(nr)]
    blk_c = [(Atop[i] / (1.0 / U_bl + dz[0] / 2 / k[0][i])) if blk[i] else 0.0 for i in range(nr)]
    void_idx = [i for i in range(nr) if void[i]]
    in_idx = [i for i in range(nr) if inside[i]]
    loaf_c = [(Atop[i] / A_loaf) if loaf[i] else 0.0 for i in range(nr)]
    edge_c = [Aedge[j] / (dr / 2 / kP + 1.0 / 12.0) for j in range(nz)]
    bot_R = [dz[-1] / 2 / k[-1][i] for i in range(nr)]
    void_R = dz_p / 2 / kP

    t = 0.0
    face_d = float(Ta)
    face_h = [float(Ta)] * nr
    loads = []
    rec = dict(loads=[])
    phase = 'fire'
    fire_end = t_fire * 3600
    t_end = None
    refired = False
    t_fe = 0.0
    t_ref_end = 0.0
    snaps = []
    zero = [0.0] * nr

    def avg(sel):
        num = 0.0
        den = 0.0
        for x, a, s in zip(T[0], Atop, sel):
            if s:
                num += x * a
                den += a
        return num / den

    while True:
        Ts = T[0]
        cast_mean = sum(dT[:8]) / 8
        Q0 = [0.0] * nr
        firing = phase in ('fire', 'refire')
        kd0 = dome.ks(dT)
        if firing:
            Gd = kd0[0] * dome.A_in / (dome.dx[0] / 2)
            face_d = min(T_top, face_d + rate * dt / 3600.0)
            q_dome_in = max(0.0, Gd * (face_d - dT[0]))
            face_h = [min(T_top, f + rate * dt / 3600.0) for f in face_h]
            for i in in_idx:
                Q0[i] += max(0.0, Gh[i] * (face_h[i] - Ts[i]))
        else:
            rate_d = sum(Qload / tau * math.exp(-(t - ts) / tau) for ts in loads if t >= ts)
            extra = 0.0
            for ts in loads:
                for t0 in (ts, ts + 45 * 60):
                    if t0 <= t < t0 + 120:
                        extra = 30.0 * Ad
            dUA = door_UA + extra
            hd = h_in(dT[0])
            num = dUA * Ta - 0.5 * rate_d + hd * dome.A_in * dT[0]
            den = dUA + hd * dome.A_in
            hh = {}
            for i in in_idx:
                hh[i] = 4 * 0.85 * SIG * (Ts[i] + 273.15) ** 3 + 4.0
                num += hh[i] * Atop[i] * Ts[i]
                den += hh[i] * Atop[i]
            Tn = num / den
            q_dome_in = hd * dome.A_in * (Tn - dT[0])
            for i in in_idx:
                Q0[i] += hh[i] * Atop[i] * (Tn - Ts[i])
            dl = 0.5 * rate_d
            Q0 = [q - lc * dl for q, lc in zip(Q0, loaf_c)]
            face_d = dT[0]
            face_h = list(Ts)
        Q0 = [q + fc * (cast_mean - x) + bc * (Ta - x) for q, fc, bc, x in zip(Q0, foot_c, blk_c, Ts)]
        Qs = [Q0] + [list(zero) for _ in range(nz - 1)]
        Tz = T[nzb]
        Qv = Qs[nzb]
        for i in void_idx:
            Qv[i] -= Atop[i] * (Tz[i] - Ta) / (void_R + 1.0 / h_out(Tz[i], Ta, hc))
        for j in range(nz):
            Tj = T[j]
            qr = [g * (a - b) for g, a, b in zip(Gr[j], Tj, Tj[1:])]
            Qj = Qs[j]
            Qs[j] = [q - a + b for q, a, b in zip(Qj, qr + [0.0], [0.0] + qr)]
        qz = [[g * (a - b) for g, a, b in zip(Gz[j], T[j], T[j + 1])] for j in range(nz - 1)]
        for j in range(nz - 1):
            Qs[j] = [q - x for q, x in zip(Qs[j], qz[j])]
        for j in range(nz - 1):
            Qs[j + 1] = [q + x for q, x in zip(Qs[j + 1], qz[j])]
        Tb = T[-1]
        Qs[-1] = [q - a * (x - Ta) / (br + 1.0 / h_out(x, Ta, hc)) for q, a, x, br in zip(Qs[-1], Atop, Tb, bot_R)]
        for j in range(nzb, nz):
            Qs[j][-1] -= edge_c[j] * (T[j][-1] - Ta)
        T = [[x + q * c for x, q, c in zip(Tj, Qj, cj)] for Tj, Qj, cj in zip(T, Qs, dtC)]
        # ドーム（1 次元）
        kd = kd0
        Qd = [0.0] * dome.N
        Qd[0] += q_dome_in
        hf = dome.half
        qd_ = [fa * (dT[j] - dT[j + 1]) / (hf[j] / kd[j] + hf[j + 1] / kd[j + 1]) for j, fa in enumerate(dome.faceA)]
        for j in range(dome.N - 1):
            Qd[j] -= qd_[j]
        for j in range(dome.N - 1):
            Qd[j + 1] += qd_[j]
        hoo = h_out(dT[-1], Ta, hc)
        Qd[-1] -= dome.Aout * (dT[-1] - Ta) / (hf[-1] / kd[-1] + 1.0 / hoo)
        dT = [a + b * dt / cc for a, b, cc in zip(dT, Qd, dome.cap)]
        t += dt
        u = avg(loaf)
        if phase == 'fire' and t >= fire_end:
            phase = 'wait'
            t_fe = t
            rec['t_fire_end'] = t
        elif phase == 'refire' and t >= t_ref_end:
            phase = 'wait2'
            t_fe = t
            rec['t_refire_end'] = t
        elif phase == 'wait' and t - t_fe >= 1200 and u <= 320.0:
            loads.append(t)
            phase = 'bake'
            rec['wait'] = (t - t_fe) / 60
            rec['loads'].append(dict(t=t, under=u))
        elif phase == 'wait' and t - t_fe > 3600:
            rec['timeout'] = True
            break
        elif phase == 'bake' and len(loads) == 1 and t >= loads[0] + 3600 - dt / 2:
            loads.append(t)
            rec['loads'].append(dict(t=t, under=u))
        elif phase == 'bake' and len(loads) == 2 and t >= loads[1] + 3600 - dt / 2 and not refired:
            if u < 250.0:
                refired = True
                phase = 'refire'
                t_ref_end = t + tref * 3600
                rec['t_refire_start'] = t
                face_d = dT[0]
                face_h = list(T[0])
            else:
                loads.append(t)
                rec['loads'].append(dict(t=t, under=u))
                t_end = t + t_after
        elif phase == 'wait2' and t - t_fe >= 1200 and u <= 300.0:
            loads.append(t)
            phase = 'bake'
            rec['loads'].append(dict(t=t, under=u))
            t_end = t + t_after
        lab = keep(t, phase, loads, rec) if keep is not None else None
        if lab:
            snaps.append(dict(label=lab, t=t, phase=phase, T=[list(row) for row in T], dome=list(dT)))
        if t_end is not None and t >= t_end:
            break
    grid = dict(rc=rc, dz=dz, nzb=nzb, nr=nr, brick=brick, void=void, inside=inside, foot=foot, blk=blk, loaf=loaf, Atop=Atop)
    return rec, snaps, grid
